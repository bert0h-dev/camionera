// Reglas de la caja: efectivo esperado, corte, desglose y comisión. Todo en centavos.

import { CashMovementType, PaymentMethod } from '../generated/prisma/enums.js';
import { fromCents, toCents } from '../tickets/money.js';

/** Billetes y monedas mexicanos para el desglose del corte (en pesos). */
export const DENOMINATIONS = [
  1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5,
] as const;

export interface MovementInput {
  type: CashMovementType;
  method: PaymentMethod;
  amount: number;
}

export interface CashTotals {
  /** Ventas por método */
  sales: Record<PaymentMethod, number>;
  /** Reembolsos por método */
  refunds: Record<PaymentMethod, number>;
  withdrawals: number;
  deposits: number;
  /** Ventas menos reembolsos (todos los métodos) */
  netSales: number;
  /** Efectivo que debe haber en la caja */
  expectedCash: number;
}

const zero = (): Record<PaymentMethod, number> => ({
  cash: 0,
  card: 0,
  transfer: 0,
  mercadopago: 0,
});

/** Totales de la caja: esperado = fondo + ventas en efectivo − reembolsos en efectivo − retiros + ingresos. */
export function cashTotals(
  openingFloat: number,
  movements: MovementInput[],
): CashTotals {
  const sales = zero();
  const refunds = zero();
  let withdrawals = 0;
  let deposits = 0;
  for (const m of movements) {
    const c = toCents(m.amount);
    if (m.type === CashMovementType.sale) sales[m.method] += c;
    else if (m.type === CashMovementType.refund) refunds[m.method] += c;
    else if (m.type === CashMovementType.withdrawal) withdrawals += c;
    else deposits += c;
  }
  const sum = (r: Record<PaymentMethod, number>) =>
    Object.values(r).reduce((a, b) => a + b, 0);
  const expected =
    toCents(openingFloat) + sales.cash - refunds.cash - withdrawals + deposits;
  const toPesos = (r: Record<PaymentMethod, number>) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [k, fromCents(v)]),
    ) as Record<PaymentMethod, number>;
  return {
    sales: toPesos(sales),
    refunds: toPesos(refunds),
    withdrawals: fromCents(withdrawals),
    deposits: fromCents(deposits),
    netSales: fromCents(sum(sales) - sum(refunds)),
    expectedCash: fromCents(expected),
  };
}

/** Suma del desglose { "500": 3, "0.5": 4 } → pesos. Rechaza denominaciones o cantidades inválidas. */
export function countBreakdown(
  breakdown: Record<string, number>,
): { ok: true; total: number } | { ok: false; error: string } {
  let total = 0;
  for (const [key, qty] of Object.entries(breakdown)) {
    const value = Number(key);
    if (!(DENOMINATIONS as readonly number[]).includes(value))
      return { ok: false, error: `Denominación desconocida: ${key}` };
    if (!Number.isInteger(qty) || qty < 0)
      return { ok: false, error: `Cantidad inválida para $${key}` };
    total += toCents(value) * qty;
  }
  return { ok: true, total: fromCents(total) };
}

/** Diferencia del corte (contado − esperado) y si pide motivo según la tolerancia. */
export function closeCheck(
  expected: number,
  counted: number,
  tolerance: number,
  notes: string | null | undefined,
): { difference: number; error: string | null } {
  const difference = fromCents(toCents(counted) - toCents(expected));
  const needsReason = Math.abs(toCents(difference)) > toCents(tolerance);
  return {
    difference,
    error:
      needsReason && !notes?.trim()
        ? `Hay una diferencia de $${difference.toFixed(2)}; escribe el motivo`
        : null,
  };
}

/** Comisión del vendedor sobre lo vendido neto en la caja (nunca negativa). */
export const commission = (netSales: number, percent: number) =>
  fromCents(Math.max(0, Math.round((toCents(netSales) * percent) / 100)));

/** Un retiro no puede dejar la caja con efectivo negativo. */
export function withdrawalError(expectedCash: number, amount: number) {
  return toCents(amount) > toCents(expectedCash)
    ? `Solo hay $${expectedCash.toFixed(2)} en efectivo en la caja`
    : null;
}
