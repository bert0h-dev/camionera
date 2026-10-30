// Reglas de cancelaciones, reembolsos y cambios de boleto. Todo en centavos.

import { PaymentMethod } from '../generated/prisma/enums.js';
import { fromCents, toCents } from './money.js';

/** Métodos con que se devuelve en taquilla (Mercado Pago se devuelve por la pasarela en la 6.7). */
export const REFUND_METHODS: PaymentMethod[] = [
  PaymentMethod.cash,
  PaymentMethod.card,
  PaymentMethod.transfer,
];

/** null si el reembolso se puede registrar; si no, el motivo. */
export function refundError(
  method: PaymentMethod,
  reference: string | null | undefined,
): string | null {
  if (!REFUND_METHODS.includes(method))
    return 'Ese método no se reembolsa en taquilla';
  if (method !== PaymentMethod.cash && !reference?.trim())
    return method === PaymentMethod.card
      ? 'Escribe la referencia de la devolución en la terminal'
      : 'Escribe la referencia de la transferencia de devolución';
  return null;
}

/** Monto que decide un admin fuera de plazo: entre 0 y lo pagado. */
export function overrideError(amount: number, paid: number): string | null {
  if (amount < 0) return 'El reembolso no puede ser negativo';
  if (toCents(amount) > toCents(paid))
    return `El reembolso no puede pasar de lo pagado ($${paid.toFixed(2)})`;
  return null;
}

export interface ChangeQuoteInput {
  /** Valor del boleto nuevo (su total) */
  newTotal: number;
  /** Lo que se le reconoce del boleto anterior: su total, o el saldo si la empresa canceló el recorrido */
  credit: number;
  /** Cargo por cambio (`tickets.change_fee`); no aplica en reubicaciones ni en cambio de asiento del mismo recorrido */
  fee: number;
}

export interface ChangeQuote {
  /** Boleto nuevo − crédito (negativo = a favor del cliente) */
  difference: number;
  fee: number;
  /** Lo que paga el cliente (0 si no paga) */
  due: number;
  /** Lo que se le devuelve (0 si no se devuelve) */
  refund: number;
}

/** Diferencia de un cambio: el cliente paga la diferencia más el cargo; si le sobra, se le devuelve (decisión 6.4). */
export function changeQuote({
  newTotal,
  credit,
  fee,
}: ChangeQuoteInput): ChangeQuote {
  const diff = toCents(newTotal) - toCents(credit);
  const net = diff + toCents(fee);
  return {
    difference: fromCents(diff),
    fee,
    due: fromCents(Math.max(0, net)),
    refund: fromCents(Math.max(0, -net)),
  };
}
