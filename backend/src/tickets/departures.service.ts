import { Injectable } from '@nestjs/common';
import { addDays, dateKey, toDate } from '../common/dates.js';
import { TripStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SearchDeparturesDto } from '../routes/dto/search.dto.js';
import { wallTime } from '../routes/route-rules.js';
import { applySeason } from '../routes/season-rules.js';
import type { SearchResult } from '../routes/search-rules.js';
import { SearchService } from '../routes/search.service.js';
import { AvailabilityService } from './availability.service.js';
import { sellableError } from './hold-rules.js';
import { segmentBase } from './itinerary-rules.js';

type TripInfo = {
  id: string;
  tripNumber: string;
  status: TripStatus;
  busId: string | null;
  actualDepartureAt: Date | null;
};

const DAY = 86_400_000;

/**
 * Búsqueda de salidas del M4.5 con el recorrido generado y los lugares libres del tramo.
 * Suma los recorridos extra (refuerzos), que no salen de un horario y la búsqueda de Rutas no ve.
 */
@Injectable()
export class DeparturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly search: SearchService,
    private readonly availability: AvailabilityService,
  ) {}

  /** Extras que abordan en la ciudad de origen en la fecha buscada, con la forma de un resultado de búsqueda. */
  private async extras(q: SearchDeparturesDto, now: Date) {
    const day = toDate(q.date);
    // Un extra que sale hasta dos días antes puede pasar por el origen buscado (rutas largas)
    const ids = await this.prisma.trip.findMany({
      where: {
        routeScheduleId: null,
        status: { not: TripStatus.cancelled },
        tripDate: { gte: addDays(day, -2), lte: day },
        route: { isActive: true },
      },
      select: { id: true },
    });
    const out: { result: SearchResult; trip: TripInfo }[] = [];
    for (const { id } of ids) {
      const trip = await this.availability.loadTrip(id);
      const points = this.availability.itinerary(trip);
      const board = points.findIndex((p) => p.cityId === q.originCityId);
      const alight = points.findIndex(
        (p, i) => i > board && p.cityId === q.destinationCityId,
      );
      if (board < 0 || alight < 0) continue;
      const from = points[board];
      const to = points[alight];
      const boardLocal = wallTime(from.at, from.timezone);
      if (boardLocal.date !== q.date || from.at < now) continue;
      if (q.timeFrom && boardLocal.time < q.timeFrom) continue;
      if (q.timeTo && boardLocal.time > q.timeTo) continue;
      const intermediateStops = alight - board - 1;
      if (q.directOnly && intermediateStops > 0) continue;
      const season = await this.availability.seasonOf(trip.tripDate);
      const basePrice = segmentBase(points, board, alight);
      const price = applySeason(
        basePrice,
        season?.priceModifierPercent ?? null,
      );
      if (q.maxPrice !== undefined && price > q.maxPrice) continue;
      const alightLocal = wallTime(to.at, to.timezone);
      const point = (p: (typeof points)[number]) => ({
        terminalId: p.terminalId,
        code: p.code,
        name: p.name,
        cityId: p.cityId,
        cityName: p.cityName,
        timezone: p.timezone,
        minutes: p.minutes,
        priceFromOrigin: p.priceFromOrigin,
      });
      out.push({
        trip,
        result: {
          routeId: trip.route.id,
          routeCode: trip.route.code,
          routeName: trip.route.name,
          // Los extras no tienen horario: la clave del resultado es el recorrido
          scheduleId: `extra-${trip.id}`,
          tripDate: dateKey(trip.tripDate),
          boardIndex: board,
          alightIndex: alight,
          board: {
            ...point(from),
            at: from.at.toISOString(),
            localDate: boardLocal.date,
            localTime: boardLocal.time,
          },
          alight: {
            ...point(to),
            at: to.at.toISOString(),
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
        },
      });
    }
    return out;
  }

  async departures(q: SearchDeparturesDto) {
    const now = new Date();
    const [{ results, connectingRoutes }, extras] = await Promise.all([
      this.search.search(q),
      this.extras(q, now),
    ]);
    const trips = results.length
      ? await this.prisma.trip.findMany({
          where: {
            OR: results.map((r) => ({
              routeScheduleId: r.scheduleId,
              tripDate: toDate(r.tripDate),
            })),
          },
          select: {
            id: true,
            tripNumber: true,
            routeScheduleId: true,
            tripDate: true,
            status: true,
            busId: true,
            actualDepartureAt: true,
          },
        })
      : [];
    const scheduled = results.map((r) => ({
      result: r,
      trip: trips.find(
        (t) =>
          t.routeScheduleId === r.scheduleId &&
          t.tripDate.toISOString().slice(0, 10) === r.tripDate &&
          t.status !== TripStatus.cancelled,
      ) as TripInfo | undefined,
    }));
    const all = [...scheduled, ...extras];
    const key = (r: SearchResult) =>
      q.sort === 'price'
        ? r.price
        : q.sort === 'duration'
          ? r.durationMinutes
          : Date.parse(r.board.at);
    all.sort(
      (a, b) =>
        key(a.result) - key(b.result) ||
        Date.parse(a.result.board.at) - Date.parse(b.result.board.at),
    );

    const free = await this.availability.freeCounts(
      all.flatMap(({ result: r, trip: t }) =>
        t ? [{ tripId: t.id, board: r.boardIndex, alight: r.alightIndex }] : [],
      ),
    );

    return {
      connectingRoutes: connectingRoutes || (extras.length ? 1 : 0),
      results: all.map(({ result: r, trip: t }) => {
        const reason = t
          ? sellableError(
              {
                status: t.status,
                hasBus: !!t.busId,
                departed: !!t.actualDepartureAt,
              },
              new Date(r.board.at),
              now,
            )
          : 'El recorrido aún no se genera';
        return {
          ...r,
          extra: r.scheduleId.startsWith('extra-'),
          trip: t
            ? { id: t.id, tripNumber: t.tripNumber, status: t.status }
            : null,
          sellable: !reason,
          notSellableReason: reason,
          freeSeats: t
            ? (free.get(`${t.id}:${r.boardIndex}:${r.alightIndex}`) ?? null)
            : null,
        };
      }),
    };
  }
}
