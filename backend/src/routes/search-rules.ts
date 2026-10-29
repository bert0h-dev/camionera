// Búsqueda de salidas entre dos ciudades: rutas directas y tramos dentro de rutas más largas.

import { wallTime, zonedInstant } from './route-rules.js';
import { scheduleStatus, type ScheduleWindow } from './schedule-rules.js';
import { applySeason, seasonOn, type SeasonWindow } from './season-rules.js';

export interface SearchPoint {
  terminalId: string;
  code: string;
  name: string;
  cityId: string;
  cityName: string;
  timezone: string;
  /** Minutos desde la salida de la ruta */
  minutes: number;
  priceFromOrigin: number;
}

export interface SearchRoute {
  id: string;
  code: string;
  name: string;
  /** Origen, paradas y destino en orden */
  points: SearchPoint[];
  schedules: (ScheduleWindow & { id: string })[];
}

export interface SearchQuery {
  originCityId: string;
  destinationCityId: string;
  /** Fecha de abordaje en la ciudad de origen ('AAAA-MM-DD') */
  date: string;
  /** Las salidas anteriores a este instante no se muestran */
  now: Date;
  timeFrom?: string;
  timeTo?: string;
  directOnly?: boolean;
  maxPrice?: number;
  sort?: 'departure' | 'price' | 'duration';
}

export interface SearchResult {
  routeId: string;
  routeCode: string;
  routeName: string;
  scheduleId: string;
  /** Fecha de salida de la ruta desde su origen (define la temporada y, en el Módulo 5, el recorrido) */
  tripDate: string;
  boardIndex: number;
  alightIndex: number;
  board: SearchPoint & { at: string; localDate: string; localTime: string };
  alight: SearchPoint & {
    at: string;
    localDate: string;
    localTime: string;
    dayOffset: number;
  };
  durationMinutes: number;
  intermediateStops: number;
  basePrice: number;
  price: number;
  season: Pick<SeasonWindow, 'name' | 'priceModifierPercent'> | null;
}

const DAY = 86_400_000;
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY)
    .toISOString()
    .slice(0, 10);
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** ¿El horario opera en esa fecha de salida de la ruta? */
export function runsOn(s: ScheduleWindow, date: string) {
  return (
    scheduleStatus(s, date) === 'current' &&
    s.daysOfWeek.includes(weekday(date))
  );
}

/** Índices de abordaje y descenso: la ciudad de origen antes que la de destino. */
export function legOf(points: SearchPoint[], q: SearchQuery) {
  const board = points.findIndex((p) => p.cityId === q.originCityId);
  if (board < 0) return null;
  const alight = points.findIndex(
    (p, i) => i > board && p.cityId === q.destinationCityId,
  );
  return alight < 0 ? null : { board, alight };
}

/** Salidas que abordan en la ciudad de origen en la fecha buscada, con hora local y precio del tramo. */
export function searchDepartures(
  routes: SearchRoute[],
  seasons: SeasonWindow[],
  q: SearchQuery,
): SearchResult[] {
  const results: SearchResult[] = [];
  for (const route of routes) {
    const leg = legOf(route.points, q);
    if (!leg) continue;
    const from = route.points[leg.board];
    const to = route.points[leg.alight];
    const originTz = route.points[0].timezone;
    // Si se aborda después de medianoche, la ruta salió uno o más días antes
    const daysBack = Math.ceil(from.minutes / 1440) + 1;

    for (const s of route.schedules) {
      for (let k = 0; k <= daysBack; k++) {
        const tripDate = addDays(q.date, -k);
        if (!runsOn(s, tripDate)) continue;
        const start = zonedInstant(tripDate, s.departureTime, originTz);
        const boardAt = new Date(start.getTime() + from.minutes * 60_000);
        const boardLocal = wallTime(boardAt, from.timezone);
        if (boardLocal.date !== q.date || boardAt < q.now) continue;
        if (q.timeFrom && boardLocal.time < q.timeFrom) continue;
        if (q.timeTo && boardLocal.time > q.timeTo) continue;

        const alightAt = new Date(start.getTime() + to.minutes * 60_000);
        const alightLocal = wallTime(alightAt, to.timezone);
        const season = seasonOn(seasons, tripDate);
        const basePrice = to.priceFromOrigin - from.priceFromOrigin;
        const price = applySeason(
          basePrice,
          season?.priceModifierPercent ?? null,
        );
        const intermediateStops = leg.alight - leg.board - 1;
        if (q.directOnly && intermediateStops > 0) continue;
        if (q.maxPrice !== undefined && price > q.maxPrice) continue;

        results.push({
          routeId: route.id,
          routeCode: route.code,
          routeName: route.name,
          scheduleId: s.id,
          tripDate,
          boardIndex: leg.board,
          alightIndex: leg.alight,
          board: {
            ...from,
            at: boardAt.toISOString(),
            localDate: boardLocal.date,
            localTime: boardLocal.time,
          },
          alight: {
            ...to,
            at: alightAt.toISOString(),
            localDate: alightLocal.date,
            localTime: alightLocal.time,
            dayOffset: Math.round(
              (Date.parse(`${alightLocal.date}T00:00:00Z`) -
                Date.parse(`${q.date}T00:00:00Z`)) /
                DAY,
            ),
          },
          durationMinutes: to.minutes - from.minutes,
          intermediateStops,
          basePrice,
          price,
          season: season
            ? {
                name: season.name,
                priceModifierPercent: season.priceModifierPercent,
              }
            : null,
        });
      }
    }
  }

  const key = (r: SearchResult) =>
    q.sort === 'price'
      ? r.price
      : q.sort === 'duration'
        ? r.durationMinutes
        : Date.parse(r.board.at);
  return results.sort(
    (a, b) =>
      key(a) - key(b) || Date.parse(a.board.at) - Date.parse(b.board.at),
  );
}
