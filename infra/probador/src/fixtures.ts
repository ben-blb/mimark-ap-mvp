import { randomUUID } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { FieldValues } from './score.js';

/** Documentos sintéticos. Nada aquí es real: razones sociales, RFC y folios son inventados o de la semilla. */

export const SUPPLIERS = {
  norte: {
    name: 'Distribuidora Alimentos del Norte SA de CV',
    taxId: 'DAN010203AB1',
    oc: 'OC-1001',
    currency: 'MXN',
  },
  bebidas: {
    name: 'Bebidas Frías de Monterrey SA de CV',
    taxId: 'BFM980512KL3',
    oc: 'OC-1002',
    currency: 'MXN',
  },
  empaques: {
    name: 'Empaques y Desechables Regios SA de CV',
    taxId: 'EDR150720QW9',
    oc: 'OC-1003',
    currency: 'MXN',
  },
  cafe: { name: 'Café Sierra Madre SC', taxId: 'CSM120304TR5', oc: 'OC-1005', currency: 'MXN' },
  snacks: {
    name: 'Importadora Snacks Global SA de CV',
    taxId: 'ISG070809MN2',
    oc: 'OC-1004',
    currency: 'USD',
  },
} as const;
export type SupplierKey = keyof typeof SUPPLIERS;

export type Layout = 0 | 1 | 2;

export interface InvoiceDoc {
  kind: 'FACTURA' | 'TICKET' | 'REMISION';
  layout: Layout;
  emisor: string;
  rfc: string;
  folio: string;
  /** Folio fiscal; `null` (un ticket) no imprime la línea. */
  uuid: string | null;
  fecha: string;
  /** Número de OC; el texto `tachada` imprime una OC ilegible; `null` no la imprime. */
  oc: string | null;
  subtotal: number;
  iva: number;
  total: number;
  moneda: 'MXN' | 'USD';
  /** Texto libre del documento: aquí van las instrucciones maliciosas de las pruebas de seguridad. */
  nota?: string;
}

const LABELS = [
  {
    uuid: 'Folio fiscal (UUID)',
    oc: 'Orden de compra',
    font: StandardFonts.Helvetica,
    bold: StandardFonts.HelveticaBold,
  },
  { uuid: 'UUID', oc: 'OC', font: StandardFonts.TimesRoman, bold: StandardFonts.TimesRomanBold },
  {
    uuid: 'Folio Fiscal',
    oc: 'Pedido',
    font: StandardFonts.Courier,
    bold: StandardFonts.CourierBold,
  },
] as const;

const money = (n: number) => n.toFixed(2);

/** Dibuja el documento como un PDF de una página, con tres diseños distintos. */
export async function renderInvoicePdf(doc: InvoiceDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const label = LABELS[doc.layout];
  const font = await pdf.embedFont(label.font);
  const bold = await pdf.embedFont(label.bold);
  let y = 790;
  const line = (text: string, opts: { bold?: boolean; size?: number } = {}) => {
    page.drawText(text, {
      x: 50,
      y,
      size: opts.size ?? 11,
      font: opts.bold ? bold : font,
      color: rgb(0, 0, 0),
    });
    y -= (opts.size ?? 11) + 7;
  };

  line(doc.kind, { bold: true, size: 20 });
  y -= 6;
  line(doc.emisor, { bold: true, size: 13 });
  line(`RFC emisor: ${doc.rfc}`);
  line('Receptor: MIMARK SA de CV · RFC MIM010101AB1');
  y -= 6;
  line(`Folio: ${doc.folio}`);
  line(`Fecha de emisión: ${doc.fecha}`);
  if (doc.uuid) line(`${label.uuid}: ${doc.uuid}`);
  if (doc.oc === 'tachada') line(`${label.oc}: ########  (ilegible, tachado)`);
  else if (doc.oc) line(`${label.oc}: ${doc.oc}`);
  y -= 10;
  line('Concepto: suministro de insumos para operación', {});
  y -= 4;
  line(`Subtotal: $${money(doc.subtotal)} ${doc.moneda}`);
  line(`IVA 16%: $${money(doc.iva)} ${doc.moneda}`);
  line(`Total: $${money(doc.total)} ${doc.moneda}`, { bold: true, size: 13 });
  if (doc.nota) {
    y -= 14;
    line('Observaciones:', { bold: true });
    for (const part of doc.nota.match(/.{1,80}(\s|$)/g) ?? [doc.nota]) line(part.trim());
  }
  return pdf.save();
}

/** Recibo de nómina, estado de cuenta o contrato: documentos que no son una compra a un proveedor. */
export async function renderOtherPdf(
  kind: 'nomina' | 'estado-de-cuenta' | 'contrato',
  seed: string,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const texts: Record<typeof kind, string[]> = {
    nomina: [
      'RECIBO DE NÓMINA',
      'Empleado: Juan Pérez Prueba · Puesto: Auxiliar',
      'Periodo: quincena 20',
      'Percepciones: $8,500.00',
      'Deducciones: $1,120.00',
      'Neto pagado: $7,380.00',
    ],
    'estado-de-cuenta': [
      'ESTADO DE CUENTA',
      'Banco Ejemplo SA · Cuenta terminación 0000',
      'Saldo inicial: $120,000.00',
      'Depósitos: $45,000.00',
      'Retiros: $38,200.00',
      'Saldo final: $126,800.00',
    ],
    contrato: [
      'CONTRATO DE PRESTACIÓN DE SERVICIOS',
      'Entre MIMARK SA de CV y Servicios Ejemplo SC',
      'Cláusula primera: objeto del contrato',
      'Cláusula segunda: vigencia de doce meses',
      'Firmas de las partes',
    ],
  };
  let y = 790;
  texts[kind].forEach((t, i) => {
    page.drawText(t, { x: 50, y, size: i === 0 ? 18 : 11, font: i === 0 ? bold : font });
    y -= i === 0 ? 30 : 18;
  });
  page.drawText(`Documento sintético ${seed}`, { x: 50, y: 60, size: 8, font });
  return pdf.save();
}

/** Un PDF válido de unos `bytes` bytes, para probar el límite de tamaño. */
export async function oversizedPdf(bytes: number): Promise<Uint8Array> {
  const base = await renderOtherPdf('contrato', 'tamaño');
  const out = new Uint8Array(bytes);
  out.set(base.subarray(0, Math.min(base.length, bytes)));
  return out;
}

export interface RunIds {
  run: string;
  /** Folio y UUID únicos por corrida: dos corridas seguidas nunca chocan por duplicado. */
  uuid: () => string;
  folio: (n: string) => string;
}

export function newRun(): RunIds {
  const run = randomUUID().slice(0, 6).toUpperCase();
  return { run, uuid: () => randomUUID().toUpperCase(), folio: (n) => `P${run}-${n}` };
}

/** Subtotal, IVA y total con centavos exactos. */
export function amounts(subtotal: number): Pick<InvoiceDoc, 'subtotal' | 'iva' | 'total'> {
  const sub = Math.round(subtotal * 100) / 100;
  const iva = Math.round(sub * 16) / 100;
  return { subtotal: sub, iva, total: Math.round((sub + iva) * 100) / 100 };
}

export function invoice(
  ids: RunIds,
  n: string,
  supplier: SupplierKey,
  over: Partial<InvoiceDoc> & { subtotal?: number } = {},
): InvoiceDoc {
  const s = SUPPLIERS[supplier];
  const { subtotal, ...rest } = over;
  return {
    kind: 'FACTURA',
    layout: 0,
    emisor: s.name,
    rfc: s.taxId,
    folio: ids.folio(n),
    uuid: ids.uuid(),
    fecha: '2026-10-06',
    oc: s.oc,
    moneda: s.currency,
    ...amounts(subtotal ?? 10000),
    ...rest,
  };
}

/** Los campos que debería extraer la IA de un documento (formato del expediente). */
export function expectedFields(doc: InvoiceDoc): FieldValues {
  return {
    supplierName: doc.emisor,
    supplierTaxId: doc.rfc,
    invoiceNumber: doc.folio,
    issueDate: doc.fecha,
    poNumber: doc.oc && doc.oc !== 'tachada' ? doc.oc : null,
    subtotal: money(doc.subtotal),
    taxes: money(doc.iva),
    total: money(doc.total),
    currency: doc.moneda,
    taxUuid: doc.uuid,
  };
}

export const NO_FIELDS: FieldValues = {
  supplierName: null,
  supplierTaxId: null,
  invoiceNumber: null,
  issueDate: null,
  poNumber: null,
  subtotal: null,
  taxes: null,
  total: null,
  currency: null,
  taxUuid: null,
};

export interface EvalDoc {
  id: string;
  kind: 'valida' | 'sin-oc' | 'fuera' | 'total-distinto' | 'ticket';
  fileName: string;
  /** El PDF ya generado. */
  bytes: Uint8Array;
  expected: FieldValues;
  outOfScope: boolean;
}

/** Los 30 documentos de la evaluación: 18 válidos, 4 sin OC, 3 fuera de alcance, 3 total distinto, 2 tickets. */
export async function buildEvalSet(ids: RunIds): Promise<EvalDoc[]> {
  const keys = Object.keys(SUPPLIERS) as SupplierKey[];
  const docs: EvalDoc[] = [];
  const add = async (id: string, kind: EvalDoc['kind'], doc: InvoiceDoc) =>
    docs.push({
      id,
      kind,
      fileName: `eval-${id}.pdf`,
      bytes: await renderInvoicePdf(doc),
      expected: expectedFields(doc),
      outOfScope: false,
    });

  for (let i = 0; i < 18; i++) {
    const supplier = keys[i % keys.length]!;
    await add(
      `V${String(i + 1).padStart(2, '0')}`,
      'valida',
      invoice(ids, `V${i + 1}`, supplier, {
        layout: (i % 3) as Layout,
        subtotal: 1000 + i * 137.55,
        fecha: `2026-10-${String((i % 20) + 1).padStart(2, '0')}`,
      }),
    );
  }
  for (let i = 0; i < 4; i++) {
    await add(
      `S${i + 1}`,
      'sin-oc',
      invoice(ids, `S${i + 1}`, keys[i % keys.length]!, {
        layout: (i % 3) as Layout,
        oc: i < 2 ? 'tachada' : null,
        subtotal: 2500 + i * 310.4,
      }),
    );
  }
  for (const [i, kind] of (['nomina', 'estado-de-cuenta', 'contrato'] as const).entries()) {
    docs.push({
      id: `F${i + 1}`,
      kind: 'fuera',
      fileName: `eval-F${i + 1}-${kind}.pdf`,
      bytes: await renderOtherPdf(kind, ids.run),
      expected: { ...NO_FIELDS },
      outOfScope: true,
    });
  }
  for (let i = 0; i < 3; i++) {
    await add(
      `T${i + 1}`,
      'total-distinto',
      invoice(ids, `T${i + 1}`, 'bebidas', {
        layout: (i % 3) as Layout,
        subtotal: 7355.17 + i * 100,
      }),
    );
  }
  for (let i = 0; i < 2; i++) {
    await add(
      `K${i + 1}`,
      'ticket',
      invoice(ids, `K${i + 1}`, 'cafe', {
        kind: 'TICKET',
        uuid: null,
        layout: (i % 3) as Layout,
        subtotal: 250 + i * 80,
      }),
    );
  }
  return docs;
}
