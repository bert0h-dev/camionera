// Reglas del abordaje: ventana de check-in y no presentados.

import { TicketStatus, TripStatus } from '../generated/prisma/enums.js';

export interface BoardingTrip {
  status: TripStatus;
  /** Hora real de salida del origen (null = no ha salido) */
  actualDepartureAt: Date | null;
}

export interface BoardingTicket {
  status: TicketStatus;
  boardIndex: number;
  /** Paso programado por su parada de subida */
  boardAt: Date;
}

export interface BoardingPolicy {
  /** Minutos antes del paso por la parada en que se abre (tickets.checkin_minutes) */
  checkinMinutes: number;
  /** Minutos después del paso por una parada intermedia en que se cierra (tickets.no_show_grace_minutes) */
  graceMinutes: number;
}

const MIN = 60_000;

/** El recorrido ya pasó la parada de subida: origen = ya salió; intermedia = salió y pasó su hora más la gracia. */
export function stopPassed(
  t: Pick<BoardingTicket, 'boardIndex' | 'boardAt'>,
  trip: BoardingTrip,
  policy: BoardingPolicy,
  now: Date,
) {
  if (trip.status === TripStatus.completed) return true;
  if (!trip.actualDepartureAt) return false;
  if (t.boardIndex === 0) return true;
  return now.getTime() > t.boardAt.getTime() + policy.graceMinutes * MIN;
}

/** null si el pasajero puede abordar ahora; si no, el motivo. */
export function checkInError(
  t: BoardingTicket,
  trip: BoardingTrip,
  policy: BoardingPolicy,
  now: Date,
): string | null {
  if (trip.status === TripStatus.cancelled) return 'El recorrido se canceló';
  if (trip.status === TripStatus.completed) return 'El recorrido ya terminó';
  if (t.status === TicketStatus.checked_in) return 'Este pasajero ya abordó';
  if (t.status === TicketStatus.no_show)
    return 'Se marcó como no presentado: el recorrido ya pasó su parada';
  if (t.status !== TicketStatus.confirmed)
    return t.status === TicketStatus.changed
      ? 'Este boleto se cambió por otro; pide el boleto nuevo'
      : 'El boleto no está vigente';
  const opens = t.boardAt.getTime() - policy.checkinMinutes * MIN;
  if (now.getTime() < opens) {
    const minutes = Math.ceil((opens - now.getTime()) / MIN);
    return `Aún no abre el abordaje de este pasajero (en ${minutes} min)`;
  }
  if (stopPassed(t, trip, policy, now))
    return 'El recorrido ya pasó la parada de este pasajero';
  return null;
}

/** Deshacer un check-in hecho por error: solo mientras el recorrido no pase su parada. */
export function undoError(
  t: BoardingTicket,
  trip: BoardingTrip,
  policy: BoardingPolicy,
  now: Date,
): string | null {
  if (t.status !== TicketStatus.checked_in) return 'El pasajero no ha abordado';
  if (stopPassed(t, trip, policy, now))
    return 'El recorrido ya pasó la parada; no se puede deshacer';
  return null;
}

/** Boletos confirmados que ya no abordaron: el recorrido pasó su parada. */
export const noShows = <T extends BoardingTicket>(
  tickets: T[],
  trip: BoardingTrip,
  policy: BoardingPolicy,
  now: Date,
) =>
  tickets.filter(
    (t) =>
      t.status === TicketStatus.confirmed && stopPassed(t, trip, policy, now),
  );
