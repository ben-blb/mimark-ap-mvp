import type { LocalDate, Money } from '@mimark/contracts/common';
import type { PoExtraction } from '@mimark/contracts/extraction';
import type { DraftWarning, PurchaseOrderDraft } from '@mimark/contracts/purchase-orders';
import { AppError } from '../../common/app-error.js';
import { centsToMoney, moneyToCents, numberToCents } from '../../common/money.js';
import { normalizeName } from '../suppliers/suppliers.rules.js';

/** Reglas puras de órdenes de compra. Las fechas son 'AAAA-MM-DD', así que se comparan como texto. */

export function checkIssuedOn(issuedOn: LocalDate, today: LocalDate): void {
  if (issuedOn > today) {
    throw new AppError('VALIDATION', undefined, {
      fieldErrors: { issuedOn: 'La fecha de la OC no puede ser futura' },
    });
  }
}

export function checkReceipt(
  po: { status: 'open' | 'cancelled'; receiptStatus: 'pending' | 'received'; issuedOn: LocalDate },
  receivedOn: LocalDate,
  today: LocalDate,
): void {
  if (po.status === 'cancelled') {
    throw new AppError('INVALID_TRANSITION', 'La OC está cancelada.');
  }
  if (po.receiptStatus === 'received') {
    throw new AppError('INVALID_TRANSITION', 'La recepción ya fue confirmada.');
  }
  if (receivedOn > today) {
    throw new AppError('VALIDATION', undefined, {
      fieldErrors: { receivedOn: 'La fecha de recepción no puede ser futura' },
    });
  }
  if (receivedOn < po.issuedOn) {
    throw new AppError('VALIDATION', undefined, {
      fieldErrors: { receivedOn: 'La recepción no puede ser anterior a la OC' },
    });
  }
}

/** "12.5" con `scale` 3 → 12500n. El texto ya viene validado por los contratos. */
function toScaled(value: string, scale: number): bigint {
  const [whole = '0', frac = ''] = value.trim().split('.');
  return BigInt(whole + frac.padEnd(scale, '0').slice(0, scale));
}

/** round(cantidad × precio, 2), mitad hacia arriba y sin punto flotante: 3 × 1250.50 → "3751.50". */
export function lineAmount(quantity: string, unitPrice: string): Money {
  const product = toScaled(quantity, 3) * toScaled(unitPrice, 4); // escala 1e-7
  const cents = (product + 50_000n) / 100_000n;
  return centsToMoney(Number(cents));
}

export function linesSubtotal(lines: { quantity: string; unitPrice: string }[]): Money {
  const cents = lines.reduce(
    (sum, l) => sum + moneyToCents(lineAmount(l.quantity, l.unitPrice)),
    0,
  );
  return centsToMoney(cents);
}

/** El total es con impuestos: nunca puede quedar por debajo de la suma de las partidas. */
export function checkTotalCoversLines(total: Money, subtotal: Money): void {
  if (moneyToCents(total) < moneyToCents(subtotal)) {
    throw new AppError('VALIDATION', undefined, {
      fieldErrors: { total: 'El total no puede ser menor que la suma de las partidas' },
    });
  }
}

/** Impuestos implícitos (total − partidas); nulo si la OC no tiene partidas. */
export function impliedTaxes(total: Money, lineCount: number, subtotal: Money): Money | null {
  return lineCount === 0 ? null : centsToMoney(moneyToCents(total) - moneyToCents(subtotal));
}

/** El checklist de recepción es todo-o-nada: se marcan exactamente las partidas de la OC. */
export function checkChecklist(lineIds: string[], checkedIds: string[]): void {
  const fail = (message: string) =>
    new AppError('VALIDATION', undefined, { fieldErrors: { checkedLineIds: message } });
  const lines = new Set(lineIds);
  const checked = new Set(checkedIds);
  if (checked.size !== checkedIds.length) throw fail('Hay partidas marcadas dos veces');
  if ([...checked].some((id) => !lines.has(id))) {
    throw fail('Hay partidas que no son de esta OC');
  }
  if (checked.size < lines.size) throw fail('Marca todas las partidas');
}

const LINE_TOLERANCE_CENTS = 1;

/** Convierte lo que leyó la IA en un borrador: números a texto, fechas y monedas válidas o nulas. */
export function normalizePoExtraction(
  extraction: PoExtraction,
): Omit<PurchaseOrderDraft, 'supplier' | 'supplierMatch' | 'supplierSuggestion' | 'warnings'> {
  const uncertain = new Set<string>(extraction.uncertainFields);
  const money = (n: number | null) =>
    n === null || !Number.isFinite(n) || n < 0 ? null : centsToMoney(numberToCents(n));
  const decimal = (n: number | null, places: number) =>
    n === null || !Number.isFinite(n) || n < 0 ? null : String(Number(n.toFixed(places)));
  const text = (v: string | null) => (v?.trim() ? v.trim() : null);

  const rawDate = text(extraction.issuedOn);
  const issuedOn = rawDate ? parseParlevelDate(rawDate).date : null;
  if (rawDate && !issuedOn) uncertain.add('issuedOn');
  // Sin moneda en el PDF (ParLevel no la trae) se usa la del proveedor, pero la persona debe revisarla.
  if (!extraction.currency) uncertain.add('currency');
  const taxId = text(extraction.supplierTaxId)?.replace(/\s+/g, '').toUpperCase() ?? null;

  return {
    number: text(extraction.number)?.toUpperCase() ?? null,
    supplierName: text(extraction.supplierName),
    supplierTaxId: taxId,
    issuedOn,
    currency: extraction.currency,
    parlevelRef: text(extraction.parlevelRef),
    lines: extraction.lines.map((l) => ({
      sku: text(l.sku),
      description: text(l.description),
      quantity: decimal(l.quantity, 3),
      unit: text(l.unit),
      unitPrice: decimal(l.unitPrice, 4),
      statedAmount: money(l.amount),
      deposit: money(l.deposit),
      receivedQuantity: decimal(l.receivedQuantity, 3),
    })),
    subtotal: money(extraction.subtotal),
    taxes: money(extraction.taxes),
    total: money(extraction.total),
    uncertainFields: [...uncertain],
  };
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * Fecha de ParLevel (software de EE. UU.): MM-DD-AAAA o MM/DD/AAAA; también acepta AAAA-MM-DD. `ambiguous` es
 * verdadero cuando día y mes podrían leerse al revés (ambos ≤ 12 y distintos).
 */
export function parseParlevelDate(text: string): { date: LocalDate | null; ambiguous: boolean } {
  const value = text.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const us = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(value);
  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : us
      ? [Number(us[3]), Number(us[1]), Number(us[2])]
      : [0, 0, 0];
  const daysInMonth =
    month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
  if (day < 1 || day > daysInMonth) return { date: null, ambiguous: false };
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${year}-${pad(month)}-${pad(day)}`,
    ambiguous: Boolean(us) && day <= 12 && day !== month,
  };
}

type DraftSupplier = NonNullable<PurchaseOrderDraft['supplier']>;
export type SupplierCandidate = DraftSupplier & { parlevelName: string | null };
type SupplierPick = Pick<
  PurchaseOrderDraft,
  'supplier' | 'supplierMatch' | 'supplierSuggestion'
> & {
  warnings: DraftWarning[];
};

/**
 * Elige el proveedor del borrador entre los activos (spec 015): por RFC, por alias de ParLevel o por nombre
 * único. Nunca elige al comprador (bloque «From:» de ParLevel).
 */
export function pickSupplier(
  candidates: SupplierCandidate[],
  extracted: {
    supplierName: string | null;
    supplierTaxId: string | null;
    supplierCity: string | null;
  },
  buyerNames: string[],
): SupplierPick {
  const found = (c: SupplierCandidate, match: 'taxId' | 'alias' | 'name'): SupplierPick => ({
    supplier: {
      id: c.id,
      name: c.name,
      taxId: c.taxId,
      creditDays: c.creditDays,
      currency: c.currency,
    },
    supplierMatch: match,
    supplierSuggestion: null,
    warnings: [],
  });
  const none = (
    warning: DraftWarning,
    suggestion: PurchaseOrderDraft['supplierSuggestion'] = null,
  ): SupplierPick => ({
    supplier: null,
    supplierMatch: null,
    supplierSuggestion: suggestion,
    warnings: [warning],
  });

  const byTaxId = extracted.supplierTaxId
    ? candidates.find((c) => c.taxId === extracted.supplierTaxId)
    : undefined;
  if (byTaxId) return found(byTaxId, 'taxId');

  const rawName = extracted.supplierName?.trim() ?? '';
  const name = normalizeName(rawName);
  if (!name) {
    return none({ field: 'supplierId', message: 'No se leyó el proveedor: elige el proveedor' });
  }
  if (buyerNames.some((buyer) => normalizeName(buyer) === name)) {
    return none({
      field: 'supplierName',
      message: 'El proveedor leído es el comprador; elige el proveedor',
    });
  }
  const byAlias = candidates.find((c) => c.parlevelName === name);
  if (byAlias) return found(byAlias, 'alias');

  const byName = candidates.filter((c) => normalizeName(c.name) === name);
  if (byName.length === 1) return found(byName[0]!, 'name');
  if (byName.length > 1) {
    return none({
      field: 'supplierId',
      message: 'Hay varios proveedores con ese nombre: elige el proveedor',
    });
  }
  return none(
    {
      field: 'supplierId',
      message: `Proveedor no registrado: «${rawName}». Regístralo o elige uno`,
    },
    { name: rawName, city: extracted.supplierCity?.trim() || null },
  );
}

/** Avisos que no bloquean: la persona decide al verificar. */
export function buildDraftWarnings(
  draft: Omit<PurchaseOrderDraft, 'warnings' | 'supplier' | 'supplierMatch' | 'supplierSuggestion'>,
  numberTaken: boolean,
  options: { supplierWarnings?: DraftWarning[]; today?: LocalDate; dateAmbiguous?: boolean } = {},
): DraftWarning[] {
  const warnings: DraftWarning[] = [];
  const warn = (field: string, message: string) => warnings.push({ field, message });

  if (numberTaken) warn('number', 'Ya existe una OC con ese folio');
  warnings.push(...(options.supplierWarnings ?? []));
  if (draft.issuedOn && options.dateAmbiguous) {
    const [year, month, day] = draft.issuedOn.split('-').map(Number) as [number, number, number];
    warn(
      'issuedOn',
      `Fecha leída como ${day} ${MONTHS[month - 1]} ${year} (MM-DD-AAAA de ParLevel); revisa`,
    );
  }
  if (draft.issuedOn && options.today && draft.issuedOn > options.today) {
    warn('issuedOn', 'La fecha de la OC es futura; revisa la fecha');
  }
  if (draft.lines.length === 0) warn('lines', 'No se encontraron partidas en el PDF');

  draft.lines.forEach((line, i) => {
    const n = i + 1;
    const missing = (
      [
        ['description', 'la descripción'],
        ['quantity', 'la cantidad'],
        ['unit', 'la unidad'],
        ['unitPrice', 'el precio unitario'],
      ] as const
    ).filter(([key]) => line[key] === null);
    for (const [key, label] of missing) warn(`lines.${i}.${key}`, `Partida ${n}: falta ${label}`);
    const deposit = line.deposit ? moneyToCents(line.deposit) : 0;
    if (line.quantity && line.unitPrice && line.statedAmount) {
      // El importe de ParLevel («Order Total») incluye el depósito de envase.
      const computed = moneyToCents(lineAmount(line.quantity, line.unitPrice)) + deposit;
      if (Math.abs(computed - moneyToCents(line.statedAmount)) > LINE_TOLERANCE_CENTS) {
        warn(
          `lines.${i}.unitPrice`,
          `Partida ${n}: cantidad × precio da ${centsToMoney(computed)} y el PDF dice ${line.statedAmount}`,
        );
      }
    }
    if (deposit > 0) {
      warn(
        `lines.${i}.deposit`,
        `Partida ${n}: depósito de envase de $${line.deposit} no incluido en el importe`,
      );
    }
    if (line.receivedQuantity && Number(line.receivedQuantity) > 0) {
      warn(
        `lines.${i}.receivedQuantity`,
        `Partida ${n}: el PDF ya trae ${line.receivedQuantity} recibidas; la recepción se confirma con el checklist`,
      );
    }
  });

  const complete = draft.lines.filter((l) => l.quantity && l.unitPrice) as {
    quantity: string;
    unitPrice: string;
    deposit: string | null;
  }[];
  if (draft.subtotal && complete.length === draft.lines.length && complete.length > 0) {
    const deposits = complete.reduce(
      (sum, l) => sum + (l.deposit ? moneyToCents(l.deposit) : 0),
      0,
    );
    const sum = moneyToCents(linesSubtotal(complete)) + deposits;
    if (Math.abs(sum - moneyToCents(draft.subtotal)) > LINE_TOLERANCE_CENTS) {
      warn(
        'subtotal',
        `La suma de las partidas (${centsToMoney(sum)}) no coincide con el subtotal del PDF (${draft.subtotal})`,
      );
    }
  }
  if (draft.total === null && draft.lines.length > 0) {
    warn(
      'total',
      'El PDF de ParLevel no trae impuestos: captura el total de la cotización o la factura',
    );
  }
  return warnings;
}
