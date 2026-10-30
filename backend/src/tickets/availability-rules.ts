// Disponibilidad de asientos por tramo: un pasajero ocupa su asiento en [subida, bajada).

import { TicketStatus } from '../generated/prisma/enums.js';
import { isActive } from './ticket-status-rules.js';

export interface Segment {
  /** Índice del punto de subida en el itinerario (0 = origen) */
  board: number;
  /** Índice del punto de bajada; siempre mayor que la subida */
  alight: number;
}

export interface SeatInput {
  number: string;
  isBlocked: boolean;
}

export interface TicketOccupancy {
  seatNumber: string;
  boardIndex: number;
  alightIndex: number;
  status: TicketStatus;
  /** Fin del apartado (solo `held`); vencido ya no ocupa */
  expiresAt?: Date | null;
}

export type SeatState = 'free' | 'held' | 'occupied' | 'blocked';

/** Dos tramos se enciman si comparten algún trecho; tocarse en una parada no cuenta. */
export const overlaps = (a: Segment, b: Segment) =>
  a.board < b.alight && b.board < a.alight;

const segmentOf = (t: TicketOccupancy): Segment => ({
  board: t.boardIndex,
  alight: t.alightIndex,
});

/** null si el tramo es válido para un itinerario de `points` puntos; si no, el motivo. */
export function segmentError(segment: Segment, points: number): string | null {
  const { board, alight } = segment;
  if (!Number.isInteger(board) || !Number.isInteger(alight))
    return 'Tramo inválido';
  if (board < 0 || alight >= points) return 'El tramo no pertenece a la ruta';
  if (alight <= board) return 'La bajada debe ser posterior a la subida';
  return null;
}

/** El boleto sigue ocupando su asiento (activo y, si es apartado, sin vencer). */
export const occupies = (t: TicketOccupancy, now: Date) =>
  isActive(t.status) &&
  !(t.status === TicketStatus.held && t.expiresAt && t.expiresAt <= now);

/** Estado de cada asiento para un tramo. */
export function seatStates(
  seats: SeatInput[],
  tickets: TicketOccupancy[],
  segment: Segment,
  now: Date,
): Map<string, SeatState> {
  const states = new Map<string, SeatState>();
  for (const s of seats) states.set(s.number, s.isBlocked ? 'blocked' : 'free');
  for (const t of tickets) {
    const current = states.get(t.seatNumber);
    if (!current || current === 'blocked' || current === 'occupied') continue;
    if (!occupies(t, now) || !overlaps(segmentOf(t), segment)) continue;
    states.set(
      t.seatNumber,
      t.status === TicketStatus.held ? 'held' : 'occupied',
    );
  }
  return states;
}

/** Números de los asientos libres para el tramo. */
export const freeSeats = (
  seats: SeatInput[],
  tickets: TicketOccupancy[],
  segment: Segment,
  now: Date,
) =>
  [...seatStates(seats, tickets, segment, now)]
    .filter(([, state]) => state === 'free')
    .map(([number]) => number);

/**
 * Lugares que le quedan a un tipo de pasajero con cupo (INAPAM, etc.) en el tramo pedido.
 * null = el tipo no tiene cupo.
 */
export function quotaLeft(
  maxPerTrip: number | null,
  sameTypeTickets: TicketOccupancy[],
  segment: Segment,
  now: Date,
): number | null {
  if (maxPerTrip == null) return null;
  const used = sameTypeTickets.filter(
    (t) => occupies(t, now) && overlaps(segmentOf(t), segment),
  ).length;
  return Math.max(0, maxPerTrip - used);
}
