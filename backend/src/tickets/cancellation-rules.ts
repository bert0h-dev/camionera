// Política de cancelación y reembolso de un boleto.

import { fromCents, toCents } from './money.js';

export interface CancellationPolicy {
  /** Horas antes de la salida en que todavía se puede cancelar (tickets.cancellation_hours) */
  cancellationHours: number;
  /** % del importe que se devuelve dentro del plazo (tickets.refund_percent) */
  refundPercent: number;
}

export interface CancellationInput {
  total: number;
  /** Cargo por servicio en línea: no se devuelve cuando cancela el pasajero */
  serviceFee: number;
  /** Salida del pasajero (su parada de subida) */
  boardAt: Date;
  now: Date;
  /** La empresa canceló el recorrido: se devuelve todo, cargo incluido */
  tripCancelled?: boolean;
}

export interface CancellationQuote {
  /** Dentro del plazo de la política */
  inWindow: boolean;
  /** Límite para cancelar con reembolso */
  deadline: Date;
  /** Reembolso que corresponde (0 fuera de plazo) */
  refund: number;
}

export function cancellationQuote(
  input: CancellationInput,
  policy: CancellationPolicy,
): CancellationQuote {
  const deadline = new Date(
    input.boardAt.getTime() - policy.cancellationHours * 3_600_000,
  );
  if (input.tripCancelled)
    return { inWindow: true, deadline, refund: input.total };
  const inWindow = input.now <= deadline;
  const refundable = toCents(input.total) - toCents(input.serviceFee);
  const refund = inWindow
    ? fromCents(Math.round((refundable * policy.refundPercent) / 100))
    : 0;
  return { inWindow, deadline, refund };
}
