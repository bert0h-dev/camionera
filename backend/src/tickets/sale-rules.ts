// Reglas de la venta en taquilla: datos de los pasajeros y pagos.

import { PaymentMethod } from '../generated/prisma/enums.js';
import { fromCents, toCents } from './money.js';

export interface PassengerInput {
  name: string;
  requiresId: boolean;
  document?: string | null;
}

/** null si los datos del pasajero alcanzan para vender; si no, el motivo. */
export function passengerError(p: PassengerInput, seat: string): string | null {
  if (p.name.trim().length < 3)
    return `Escribe el nombre del pasajero del asiento ${seat}`;
  if (p.requiresId && !p.document?.trim())
    return `El pasajero del asiento ${seat} necesita identificación (su tipo de pasajero la pide)`;
  return null;
}

/** Métodos que se cobran en taquilla (Mercado Pago llega con la venta en línea). */
export const COUNTER_METHODS: PaymentMethod[] = [
  PaymentMethod.cash,
  PaymentMethod.card,
  PaymentMethod.transfer,
];

export interface PaymentInput {
  method: PaymentMethod;
  amount: number;
  /** Efectivo recibido (solo efectivo) */
  received?: number | null;
  /** Autorización de la terminal o referencia de la transferencia */
  reference?: string | null;
}

export type PaymentsCheck =
  { ok: true; change: number } | { ok: false; error: string };

/**
 * Los pagos deben sumar exactamente el total. Tarjeta y transferencia piden referencia;
 * el efectivo recibido no puede ser menor a lo que se cobra en efectivo.
 */
export function checkPayments(
  payments: PaymentInput[],
  total: number,
): PaymentsCheck {
  if (payments.length === 0) return { ok: false, error: 'Agrega un pago' };
  let change = 0;
  for (const p of payments) {
    if (!COUNTER_METHODS.includes(p.method))
      return { ok: false, error: 'Ese método no se cobra en taquilla' };
    if (!(toCents(p.amount) > 0))
      return { ok: false, error: 'Cada pago debe ser mayor a cero' };
    if (p.method === PaymentMethod.cash) {
      const received = toCents(p.received ?? p.amount);
      if (received < toCents(p.amount))
        return {
          ok: false,
          error: 'El efectivo recibido es menor al importe en efectivo',
        };
      change += received - toCents(p.amount);
    } else if (!p.reference?.trim())
      return {
        ok: false,
        error:
          p.method === PaymentMethod.card
            ? 'Escribe el número de autorización de la terminal'
            : 'Escribe la referencia de la transferencia',
      };
  }
  const paid = payments.reduce((a, p) => a + toCents(p.amount), 0);
  const due = toCents(total);
  if (paid < due)
    return {
      ok: false,
      error: `Faltan $${fromCents(due - paid).toFixed(2)} por cobrar`,
    };
  if (paid > due)
    return {
      ok: false,
      error: `Los pagos pasan el total por $${fromCents(paid - due).toFixed(2)}; el excedente en efectivo va en "recibido"`,
    };
  return { ok: true, change: fromCents(change) };
}
