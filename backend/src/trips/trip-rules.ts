// Reglas puras de los recorridos: qué salidas tocan en un rango de fechas y cómo sincronizarlas.

import { zonedInstant } from '../routes/route-rules.js';
import type { ScheduleWindow } from '../routes/schedule-rules.js';
import { runsOn } from '../routes/search-rules.js';
import { TripStatus } from '../generated/prisma/enums.js';

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  scheduled: 'Programado',
  boarding: 'Abordando',
  in_transit: 'En ruta',
  delayed: 'Retrasado',
  completed: 'Terminado',
  cancelled: 'Cancelado',
};

const DAY = 86_400_000;

/** 'AAAA-MM-DD' + n días. */
export const addDayKey = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY)
    .toISOString()
    .slice(0, 10);

/** Fechas de `from` a `to`, ambas incluidas. */
export function dateRange(from: string, to: string) {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDayKey(d, 1)) days.push(d);
  return days;
}

/** 'GDL-MEX-01' + '2026-10-30' + '07:30' → 'GDL-MEX-01-261030-0730'; extras: '…-E2'. */
export function tripNumber(
  routeCode: string,
  tripDate: string,
  time: string,
  extra?: number,
) {
  const base = `${routeCode}-${tripDate.slice(2).replaceAll('-', '')}-${time.replace(':', '')}`;
  return extra ? `${base}-E${extra}` : base;
}

export interface PlanRoute {
  id: string;
  code: string;
  durationMinutes: number;
  /** Zona de la terminal de origen */
  originTz: string;
  /** Una ruta inactiva no genera nada */
  isActive: boolean;
  /** platformId = andén habitual que hereda el recorrido */
  schedules: (ScheduleWindow & { id: string; platformId?: string | null })[];
}

export interface PlannedTrip {
  routeId: string;
  routeScheduleId: string;
  tripDate: string;
  departureAt: Date;
  arrivalAt: Date;
  durationMinutes: number;
  tripNumber: string;
}

/** Salidas que deben existir en el rango según los horarios activos de la ruta. */
export function plannedTrips(
  route: PlanRoute,
  from: string,
  to: string,
): PlannedTrip[] {
  if (!route.isActive) return [];
  const out: PlannedTrip[] = [];
  for (const date of dateRange(from, to))
    for (const s of route.schedules) {
      if (!runsOn(s, date)) continue;
      const departureAt = zonedInstant(date, s.departureTime, route.originTz);
      out.push({
        routeId: route.id,
        routeScheduleId: s.id,
        tripDate: date,
        departureAt,
        arrivalAt: new Date(
          departureAt.getTime() + route.durationMinutes * 60_000,
        ),
        durationMinutes: route.durationMinutes,
        tripNumber: tripNumber(route.code, date, s.departureTime),
      });
    }
  return out;
}

export interface ExistingTrip {
  id: string;
  routeScheduleId: string;
  tripDate: string;
  departureAt: Date;
  arrivalAt: Date;
  status: TripStatus;
  /** Tiene unidad, conductor o cobrador */
  assigned: boolean;
}

const key = (t: { routeScheduleId: string; tripDate: string }) =>
  `${t.routeScheduleId}|${t.tripDate}`;

/**
 * Compara los recorridos futuros con lo que dicen los horarios.
 * - `remove`: programados sin asignar que ya no tocan o cambiaron de hora; se borran y se vuelven a generar.
 * - `stale`: los mismos casos pero ya asignados; no se tocan y se avisan para revisarlos a mano.
 * Los cancelados se respetan: el lugar de esa salida queda cancelado.
 */
export function syncPlan(existing: ExistingTrip[], planned: PlannedTrip[]) {
  const wanted = new Map(planned.map((p) => [key(p), p]));
  const remove: string[] = [];
  const stale: string[] = [];
  for (const t of existing) {
    if (t.status !== TripStatus.scheduled) continue;
    const p = wanted.get(key(t));
    const matches =
      p &&
      p.departureAt.getTime() === t.departureAt.getTime() &&
      p.arrivalAt.getTime() === t.arrivalAt.getTime();
    if (matches) continue;
    (t.assigned ? stale : remove).push(t.id);
  }
  return { remove, stale };
}
