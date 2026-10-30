import { BadRequestException, Injectable } from '@nestjs/common';
import { businessTimezone, toDate } from '../common/dates.js';
import { Prisma } from '../generated/prisma/client.js';
import { TripStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { wallTime } from '../routes/route-rules.js';
import { timeKey } from '../routes/schedule-rules.js';
import { OccupancyReportDto } from './dto/report.dto.js';
import {
  bandOf,
  HOUR_SLOTS,
  slotOf,
  tripOccupancy,
  weighted,
  type SegmentSales,
  type TripOccupancy,
} from './occupancy-rules.js';
import { change, previousRange, rangeError } from './report-rules.js';

const num = (v: unknown) => Number(v ?? 0);
const avg = (xs: number[]) =>
  xs.length
    ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10
    : 0;

/**
 * Ocupación de los recorridos operados (con unidad y no cancelados) por día de salida. La medida
 * principal es por asiento-km; los conteos de boletos se hacen en SQL por recorrido y tramo.
 */
@Injectable()
export class OccupancyReportService {
  constructor(private readonly prisma: PrismaService) {}

  /** Recorridos del periodo con su ocupación ya calculada. */
  private async trips(q: OccupancyReportDto, from: string, to: string) {
    const where: Prisma.TripWhereInput = {
      tripDate: { gte: toDate(from), lte: toDate(to) },
      status: { not: TripStatus.cancelled },
      busId: { not: null },
      routeId: q.routeId,
    };
    const [trips, rows] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        select: {
          id: true,
          tripNumber: true,
          tripDate: true,
          departureAt: true,
          status: true,
          routeId: true,
          routeScheduleId: true,
          bus: {
            select: {
              economicNumber: true,
              _count: { select: { seats: { where: { isBlocked: false } } } },
            },
          },
        },
        orderBy: { departureAt: 'asc' },
      }),
      this.prisma.$queryRaw<
        {
          trip: string;
          board: number;
          alight: number;
          sold: unknown;
          boarded: unknown;
          no_show: unknown;
          revenue: unknown;
        }[]
      >`
        SELECT t.trip_id::text AS trip, t.board_index AS board, t.alight_index AS alight,
               COUNT(*) sold,
               COUNT(*) FILTER (WHERE t.status = 'checked_in') boarded,
               COUNT(*) FILTER (WHERE t.status = 'no_show') no_show,
               SUM(t.total) revenue
        FROM tickets t JOIN trips tr ON tr.id = t.trip_id
        WHERE tr.trip_date >= ${toDate(from)} AND tr.trip_date <= ${toDate(to)}
          AND tr.status <> 'cancelled' AND tr.bus_id IS NOT NULL
          AND ${q.routeId ? Prisma.sql`tr.route_id = ${q.routeId}::uuid` : Prisma.sql`TRUE`}
          AND t.status IN ('confirmed', 'checked_in', 'no_show')
        GROUP BY 1, 2, 3`,
    ]);
    const routeIds = [...new Set(trips.map((t) => t.routeId))];
    const routes = await this.prisma.route.findMany({
      where: { id: { in: routeIds } },
      select: {
        id: true,
        code: true,
        name: true,
        distanceKm: true,
        originTerminal: {
          select: { code: true, city: { select: { timezone: true } } },
        },
        destinationTerminal: { select: { code: true } },
        stops: {
          orderBy: { stopOrder: 'asc' },
          select: { kmFromOrigin: true, terminal: { select: { code: true } } },
        },
        schedules: {
          select: {
            id: true,
            departureTime: true,
            daysOfWeek: true,
            isActive: true,
          },
        },
      },
    });
    const routeOf = new Map(
      routes.map((r) => {
        const km = [
          0,
          ...r.stops.map((s) => num(s.kmFromOrigin)),
          num(r.distanceKm),
        ];
        const codes = [
          r.originTerminal.code,
          ...r.stops.map((s) => s.terminal.code),
          r.destinationTerminal.code,
        ];
        return [r.id, { ...r, km, codes, tz: r.originTerminal.city.timezone }];
      }),
    );
    const segs = new Map<string, SegmentSales[]>();
    for (const r of rows)
      segs.set(r.trip, [
        ...(segs.get(r.trip) ?? []),
        {
          board: r.board,
          alight: r.alight,
          sold: num(r.sold),
          boarded: num(r.boarded),
          noShow: num(r.no_show),
          revenue: num(r.revenue),
        },
      ]);
    return trips.map((t) => {
      const route = routeOf.get(t.routeId)!;
      const occ = tripOccupancy(
        t.bus?._count.seats ?? 0,
        route.km,
        segs.get(t.id) ?? [],
      );
      const local = wallTime(t.departureAt, route.tz);
      return {
        trip: t,
        route,
        occ,
        local,
        weekday: new Date(`${local.date}T12:00:00Z`).getUTCDay(),
      };
    });
  }

  async occupancy(q: OccupancyReportDto) {
    const err = rangeError(q.from, q.to);
    if (err) throw new BadRequestException(err);
    const prev = previousRange(q.from, q.to);
    const [list, before] = await Promise.all([
      this.trips(q, q.from, q.to),
      this.trips(q, prev.from, prev.to),
    ]);
    const occs = list.map((x) => x.occ);
    const sum = (
      k: keyof Pick<
        TripOccupancy,
        'seats' | 'sold' | 'boarded' | 'noShow' | 'revenue'
      >,
    ) => occs.reduce((a, o) => a + o[k], 0);
    const byKm = weighted(occs);
    const prevByKm = weighted(before.map((x) => x.occ));
    // Solo cuentan para "abordaron" los recorridos que ya salieron
    const departed = list.filter(
      (x) =>
        x.trip.status === TripStatus.completed ||
        x.trip.status === TripStatus.in_transit,
    );
    const depSold = departed.reduce((a, x) => a + x.occ.sold, 0);
    const summary = {
      trips: list.length,
      byKm,
      bySeats: sum('seats')
        ? Math.round((sum('sold') / sum('seats')) * 1000) / 10
        : 0,
      seatsOffered: sum('seats'),
      sold: sum('sold'),
      boarded: sum('boarded'),
      noShow: sum('noShow'),
      noShowRate: depSold
        ? Math.round(
            (departed.reduce((a, x) => a + x.occ.noShow, 0) / depSold) * 1000,
          ) / 10
        : 0,
      boardedRate: depSold
        ? Math.round(
            (departed.reduce((a, x) => a + x.occ.boarded, 0) / depSold) * 1000,
          ) / 10
        : 0,
      revenuePerTrip: list.length
        ? Math.round((sum('revenue') / list.length) * 100) / 100
        : 0,
      empty: occs.filter((o) => bandOf(o.byKm) === 'empty').length,
      full: occs.filter((o) => bandOf(o.byKm) === 'full').length,
      previous: { ...prev, byKm: prevByKm, trips: before.length },
      change: {
        byKm: prevByKm ? Math.round((byKm - prevByKm) * 10) / 10 : null,
        trips: change(list.length, before.length),
      },
    };

    // Por día de salida
    const days = new Map<string, typeof list>();
    for (const x of list)
      days.set(x.local.date, [...(days.get(x.local.date) ?? []), x]);
    const byDay = [...days.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, xs]) => ({
        date,
        trips: xs.length,
        byKm: weighted(xs.map((x) => x.occ)),
        sold: xs.reduce((a, x) => a + x.occ.sold, 0),
      }));

    // Por ruta
    const routes = new Map<string, typeof list>();
    for (const x of list)
      routes.set(x.route.id, [...(routes.get(x.route.id) ?? []), x]);
    const byRoute = [...routes.values()]
      .map((xs) => ({
        routeId: xs[0].route.id,
        code: xs[0].route.code,
        name: xs[0].route.name,
        trips: xs.length,
        byKm: weighted(xs.map((x) => x.occ)),
        sold: xs.reduce((a, x) => a + x.occ.sold, 0),
        revenuePerTrip:
          Math.round(
            (xs.reduce((a, x) => a + x.occ.revenue, 0) / xs.length) * 100,
          ) / 100,
      }))
      .sort((a, b) => b.byKm - a.byKm);

    // Mapa de calor: día de la semana × franja de 3 h (hora local del origen)
    const heat = new Map<string, typeof list>();
    for (const x of list) {
      const key = `${x.weekday}|${slotOf(Number(x.local.time.slice(0, 2)))}`;
      heat.set(key, [...(heat.get(key) ?? []), x]);
    }
    const heatmap = [...heat.entries()].map(([key, xs]) => {
      const [weekday, slot] = key.split('|').map(Number);
      return {
        weekday,
        slot,
        fromHour: HOUR_SLOTS[slot],
        trips: xs.length,
        byKm: weighted(xs.map((x) => x.occ)),
      };
    });

    // Por horario programado (los extras aparte)
    const schedules = new Map<string, typeof list>();
    for (const x of list) {
      const key = x.trip.routeScheduleId ?? `extra|${x.route.id}`;
      schedules.set(key, [...(schedules.get(key) ?? []), x]);
    }
    const bySchedule = [...schedules.entries()]
      .map(([key, xs]) => {
        const s = xs[0].route.schedules.find((y) => y.id === key);
        return {
          scheduleId: s?.id ?? null,
          routeId: xs[0].route.id,
          routeCode: xs[0].route.code,
          routeName: xs[0].route.name,
          departureTime: s ? timeKey(s.departureTime) : 'Extras',
          daysOfWeek: s?.daysOfWeek ?? [],
          active: s?.isActive ?? false,
          trips: xs.length,
          byKm: weighted(xs.map((x) => x.occ)),
          avgSold: avg(xs.map((x) => x.occ.sold)),
          empty: xs.filter((x) => bandOf(x.occ.byKm) === 'empty').length,
        };
      })
      .sort((a, b) => a.byKm - b.byKm);

    // Por trecho en rutas con paradas: asientos ocupados promedio entre cada par de puntos
    const byLeg = [...routes.values()]
      .filter((xs) => xs[0].route.codes.length > 2)
      .map((xs) => {
        const r = xs[0].route;
        const legs = r.codes.slice(0, -1).map((code, i) => {
          const seats = xs.reduce((a, x) => a + x.occ.seats, 0);
          const used = xs.reduce((a, x) => a + (x.occ.legs[i] ?? 0), 0);
          return {
            from: code,
            to: r.codes[i + 1],
            km: Math.round((r.km[i + 1] - r.km[i]) * 10) / 10,
            occupancy: seats ? Math.round((used / seats) * 1000) / 10 : 0,
            avgSeats: avg(xs.map((x) => x.occ.legs[i] ?? 0)),
          };
        });
        return { routeId: r.id, code: r.code, name: r.name, legs };
      });

    const detail = list.map((x) => ({
      tripId: x.trip.id,
      tripNumber: x.trip.tripNumber,
      date: x.local.date,
      time: x.local.time,
      status: x.trip.status,
      routeCode: x.route.code,
      bus: x.trip.bus?.economicNumber ?? null,
      seats: x.occ.seats,
      sold: x.occ.sold,
      boarded: x.occ.boarded,
      noShow: x.occ.noShow,
      byKm: x.occ.byKm,
      bySeats: x.occ.bySeats,
      revenue: x.occ.revenue,
    }));

    return {
      range: { from: q.from, to: q.to, timezone: businessTimezone() },
      summary,
      byDay,
      byRoute,
      heatmap,
      bySchedule,
      byLeg,
      detail,
    };
  }
}
