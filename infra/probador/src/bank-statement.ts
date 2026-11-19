import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/** Estado de cuenta sintético (spec 022): el PDF y las filas que la IA debe devolver. Nada es de un banco real. */

export interface BankRow {
  date: string;
  concept: string;
  withdrawal: string | null;
  deposit: string | null;
  balance: string;
}

export interface BankStatement {
  opening: string;
  closing: string;
  rows: BankRow[];
}

const cents = (value: string): number => Math.round(Number(value) * 100);
const money = (c: number): string => (c / 100).toFixed(2);

const CONCEPTS = [
  'SPEI RECIBIDO KIOSKO CENTRO',
  'PAGO PROVEEDOR REF 0012345',
  'COMISION MANEJO DE CUENTA',
  'DEPOSITO EFECTIVO SUCURSAL 118',
  'COMPRA TARJETA 4152313112345678 GASOLINERA',
  'SPEI ENVIADO NOMINA QUINCENA',
];

/** `count` movimientos en `month` ('AAAA-MM'); el saldo corrido se calcula aquí, nunca lo calcula la IA. */
export function buildStatement(month: string, count = 24): BankStatement {
  const opening = 233_214_38;
  let balance = opening;
  const rows: BankRow[] = [];
  for (let i = 0; i < count; i += 1) {
    const amount = 1_000_00 + ((i * 7_319) % 90_000);
    const isDeposit = i % 3 !== 1;
    balance += isDeposit ? amount : -amount;
    rows.push({
      date: `${month}-${String(1 + Math.floor((i * 27) / count)).padStart(2, '0')}`,
      concept: `${CONCEPTS[i % CONCEPTS.length]} ${i + 1}`,
      withdrawal: isDeposit ? null : money(amount),
      deposit: isDeposit ? money(amount) : null,
      balance: money(balance),
    });
  }
  return { opening: money(opening), closing: money(balance), rows };
}

export async function renderStatementPdf(statement: BankStatement): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Courier);
  let page = pdf.addPage([612, 792]);
  let y = 750;
  const line = (text: string) => {
    if (y < 50) {
      page = pdf.addPage([612, 792]);
      y = 750;
    }
    page.drawText(text, { x: 30, y, size: 8, font, color: rgb(0, 0, 0) });
    y -= 12;
  };
  line('BANCO SINTETICO · ESTADO DE CUENTA DE CHEQUES');
  line(`Saldo inicial: ${statement.opening}`);
  line(
    'FECHA       CONCEPTO                                        RETIRO      DEPOSITO       SALDO',
  );
  for (const r of statement.rows) {
    line(
      `${r.date}  ${r.concept.padEnd(44)} ${(r.withdrawal ?? '').padStart(10)} ${(r.deposit ?? '').padStart(12)} ${r.balance.padStart(12)}`,
    );
  }
  line(`Saldo final: ${statement.closing}`);
  return pdf.save();
}

export interface BankScore {
  total: number;
  exact: number;
  /** Índices (desde 0) de las filas esperadas que no coinciden. */
  misses: number[];
  extra: number;
  balancesOk: boolean;
}

/** Una fila es exacta si fecha, retiro, depósito y saldo coinciden; el concepto solo se compara sin espacios. */
export function scoreStatement(expected: BankStatement, actual: BankStatement | null): BankScore {
  const squash = (s: string) => s.replace(/\s+/g, '');
  const rows = actual?.rows ?? [];
  const misses: number[] = [];
  expected.rows.forEach((want, i) => {
    const got = rows[i];
    const same =
      got &&
      got.date === want.date &&
      (got.withdrawal === null ? null : cents(got.withdrawal)) ===
        (want.withdrawal === null ? null : cents(want.withdrawal)) &&
      (got.deposit === null ? null : cents(got.deposit)) ===
        (want.deposit === null ? null : cents(want.deposit)) &&
      cents(got.balance) === cents(want.balance) &&
      squash(got.concept).length > 0;
    if (!same) misses.push(i);
  });
  return {
    total: expected.rows.length,
    exact: expected.rows.length - misses.length,
    misses,
    extra: Math.max(0, rows.length - expected.rows.length),
    balancesOk:
      actual !== null &&
      cents(actual.opening) === cents(expected.opening) &&
      cents(actual.closing) === cents(expected.closing),
  };
}
