// Reglas para apartar asientos: cuándo se vende un recorrido y cuánto dura el apartado.

import { TripStatus } from '../generated/prisma/enums.js';

export interface SellableTrip {
  status: TripStatus;
  hasBus: boolean;
  /** Ya salió del origen */
  departed: boolean;
}

const SELLABLE: TripStatus[] = [
  TripStatus.scheduled,
  TripStatus.boarding,
  TripStatus.delayed,
];

/**
 * null si se pueden vender boletos que suben en `boardAt`; si no, el motivo.
 * Solo se vende con unidad asignada (decisión del M6) y antes de que pase el punto de subida.
 */
export function sellableError(
  trip: SellableTrip,
  boardAt: Date,
  now: Date,
): string | null {
  if (trip.status === TripStatus.cancelled) return 'El recorrido se canceló';
  if (!SELLABLE.includes(trip.status) || trip.departed)
    return 'El recorrido ya salió; no se venden boletos';
  if (!trip.hasBus)
    return 'El recorrido aún no tiene unidad asignada; se vende al asignarla';
  if (boardAt <= now) return 'La salida desde ese punto ya pasó';
  return null;
}

/** null si la cantidad de asientos es válida para una compra; si no, el motivo. */
export function seatCountError(count: number, maxPerPurchase: number) {
  if (count < 1) return 'Elige al menos un asiento';
  if (count > maxPerPurchase)
    return `Máximo ${maxPerPurchase} boletos por compra`;
  return null;
}

/** Fin del apartado a partir de ahora. */
export const holdUntil = (now: Date, minutes: number) =>
  new Date(now.getTime() + minutes * 60_000);

/**
 * El apartado se puede extender una sola vez: si ya dura más que un apartado normal,
 * es que ya se extendió.
 */
export const canExtend = (
  createdAt: Date,
  expiresAt: Date,
  holdMinutes: number,
) => expiresAt.getTime() - createdAt.getTime() <= holdMinutes * 60_000 + 1000;
