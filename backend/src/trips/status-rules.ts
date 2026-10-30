// Máquina de estados de un recorrido: qué cambios valen y qué piden.

import { TripStatus } from '../generated/prisma/enums.js';

/**
 * Transiciones válidas (contexto 5.6, más `delayed` antes de salir, aprobado el 2026-10-30):
 * scheduled → boarding → in_transit → completed; delayed y cancelled según la tabla.
 */
export const TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  scheduled: [TripStatus.boarding, TripStatus.delayed, TripStatus.cancelled],
  boarding: [TripStatus.in_transit, TripStatus.delayed, TripStatus.cancelled],
  in_transit: [TripStatus.completed, TripStatus.delayed],
  delayed: [
    TripStatus.boarding,
    TripStatus.in_transit,
    TripStatus.completed,
    TripStatus.cancelled,
  ],
  completed: [],
  cancelled: [],
};

/** Cambios que el conductor puede hacer en sus propios recorridos (cancelar no). */
export const DRIVER_TRANSITIONS: TripStatus[] = [
  TripStatus.boarding,
  TripStatus.in_transit,
  TripStatus.delayed,
  TripStatus.completed,
];

export interface TransitionTrip {
  status: TripStatus;
  departureAt: Date;
  /** Ya salió (tiene hora real de salida) */
  departed: boolean;
  hasBus: boolean;
  hasDriver: boolean;
}

export interface TransitionInput {
  to: TripStatus;
  now: Date;
  /** Minutos antes de la salida en que se abre el abordaje */
  boardingOpenMinutes: number;
  reason?: string | null;
  endOdometerKm?: number | null;
}

/** null si el cambio es válido; si no, el motivo. */
export function transitionError(
  trip: TransitionTrip,
  input: TransitionInput,
): string | null {
  const { to } = input;
  if (!TRANSITIONS[trip.status].includes(to))
    return trip.status === TripStatus.completed ||
      trip.status === TripStatus.cancelled
      ? 'El recorrido ya terminó o se canceló; no admite cambios'
      : 'Ese cambio de estado no es válido desde el estado actual';

  // Un retraso en ruta solo vuelve a "en ruta" o termina; uno antes de salir vuelve a abordar o sale
  if (trip.status === TripStatus.delayed) {
    if (
      trip.departed &&
      (to === TripStatus.boarding || to === TripStatus.cancelled)
    )
      return 'El recorrido ya salió: solo puede seguir en ruta o terminar';
    if (!trip.departed && to === TripStatus.completed)
      return 'El recorrido aún no sale; no puede terminar';
  }

  const needsCrew =
    to === TripStatus.boarding ||
    (to === TripStatus.in_transit && !trip.departed);
  if (needsCrew && (!trip.hasBus || !trip.hasDriver))
    return 'Asigna unidad y conductor antes de abordar o salir';

  if (to === TripStatus.boarding) {
    const opens =
      trip.departureAt.getTime() - input.boardingOpenMinutes * 60_000;
    if (input.now.getTime() < opens)
      return `El abordaje se abre ${input.boardingOpenMinutes} min antes de la salida`;
  }

  if (
    (to === TripStatus.delayed || to === TripStatus.cancelled) &&
    !input.reason?.trim()
  )
    return to === TripStatus.delayed
      ? 'Indica el motivo del retraso'
      : 'Indica el motivo de la cancelación';

  if (to === TripStatus.completed && input.endOdometerKm == null)
    return 'Captura el odómetro de llegada';

  return null;
}

/** Minutos de retraso real de la salida (0 si salió a tiempo o antes). */
export const departureDelayMinutes = (
  departureAt: Date,
  actualDepartureAt: Date | null,
) =>
  actualDepartureAt
    ? Math.max(
        0,
        Math.round(
          (actualDepartureAt.getTime() - departureAt.getTime()) / 60_000,
        ),
      )
    : null;
