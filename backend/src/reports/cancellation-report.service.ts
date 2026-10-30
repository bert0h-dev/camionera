import { BadRequestException, Injectable } from '@nestjs/common';
import { businessTimezone, toDate } from '../common/dates.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { timeKey } from '../routes/schedule-rules.js';
import { fromCents, toCents } from '../tickets/money.js';
import {
  NOTICE_BUCKETS,
  noticeBucket,
  normalizeReason,
  rate,
  refundKind,
  type RefundKind,
} from './cancellation-report-rules.js';
import { OccupancyReportDto } from './dto/report.dto.js';
import { previousRange, rangeError } from './report-rules.js';
import { instantsOf } from './sales-report.service.js';

const num = (v: unknown) => Number(v ?? 0);

type TicketGroup = {
  day: string;
  route_id: string;
  schedule_id: string | null;
  type: string;
  status: string;
  trip_cancelled: boolean;
  departed: boolean;
  n: unknown;
  s: unknown;
};

/**
 * Cancelaciones y no presentados. Las tasas son por **fecha de salida** (boletos de los recorridos del
 * periodo); la anticipación, los motivos y el dinero (reembolsos, cambios), por la fecha en que pasaron.
 */
@Injectable()
export class CancellationReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private routeCond(routeId?: string) {
    return routeId
      ? Prisma.sql`tr.route_id = ${routeId}::uuid`
      : Prisma.sql`TRUE`;
  }

  /** Boletos de los recorridos del periodo agrupados por día, ruta, horario, tipo y estado. */
  private ticketGroups(from: string, to: string, routeId?: string) {
    return this.prisma.$queryRaw<TicketGroup[]>`
      SELECT to_char(tr.trip_date, 'YYYY-MM-DD') AS day, tr.route_id::text AS route_id,
             tr.route_schedule_id::text AS schedule_id, pt.name AS type, t.status::text AS status,
             (tr.status = 'cancelled') AS trip_cancelled, (tr.actual_departure_at IS NOT NULL) AS departed,
             COUNT(*) n, SUM(t.total) s
      FROM tickets t JOIN trips tr ON tr.id = t.trip_id JOIN passenger_types pt ON pt.id = t.passenger_type_id
      WHERE tr.trip_date >= ${toDate(from)} AND tr.trip_date <= ${toDate(to)}
        AND t.status IN ('confirmed', 'checked_in', 'no_show', 'cancelled')
        AND ${this.routeCond(routeId)}
      GROUP BY 1, 2, 3, 4, 5, 6, 7`;
  }

  /** Tasas a partir de los grupos: cancelación del pasajero y no presentados. */
  private rates(rows: TicketGroup[]) {
    let sold = 0;
    let cancelled = 0;
    let boarded = 0;
    let noShow = 0;
    let noShowRevenue = 0;
    for (const r of rows) {
      if (r.trip_cancelled) continue; // los recorridos cancelados por la empresa van aparte
      const n = num(r.n);
      sold += n;
      if (r.status === 'cancelled') cancelled += n;
      if (r.departed && r.status === 'checked_in') boarded += n;
      if (r.departed && r.status === 'no_show') {
        noShow += n;
        noShowRevenue += toCents(num(r.s));
      }
    }
    return {
      sold,
      cancelled,
      cancelRate: rate(cancelled, sold),
      noShow,
      noShowRate: rate(noShow, boarded + noShow),
      noShowRevenue: fromCents(noShowRevenue),
    };
  }

  async cancellations(q: OccupancyReportDto) {
    const err = rangeError(q.from, q.to);
    if (err) throw new BadRequestException(err);
    const { gte, lt } = instantsOf(q.from, q.to);
    const tz = businessTimezone();
    const prev = previousRange(q.from, q.to);
    const route = this.routeCond(q.routeId);

    const [
      groups,
      prevGroups,
      passengerCancels,
      refunds,
      prevRefunds,
      companyTrips,
      changes,
      routes,
      schedules,
      cancellationHours,
    ] = await Promise.all([
      this.ticketGroups(q.from, q.to, q.routeId),
      this.ticketGroups(prev.from, prev.to, q.routeId),
      // Cancelaciones del pasajero por fecha de cancelación (recorrido no cancelado)
      this.prisma.$queryRaw<
        {
          day: string;
          hours: unknown;
          reason: string | null;
          n: unknown;
          s: unknown;
        }[]
      >`
          SELECT to_char(t.cancelled_at AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
                 FLOOR(EXTRACT(EPOCH FROM (t.board_at - t.cancelled_at)) / 3600) AS hours,
                 t.cancel_reason AS reason, COUNT(*) n, SUM(t.total) s
          FROM tickets t JOIN trips tr ON tr.id = t.trip_id
          WHERE t.status = 'cancelled' AND tr.status <> 'cancelled'
            AND t.cancelled_at >= ${gte} AND t.cancelled_at < ${lt} AND ${route}
          GROUP BY 1, 2, 3`,
      this.prisma.$queryRaw<
        {
          method: string;
          by: string | null;
          reason: string;
          trip_cancelled: boolean;
          n: unknown;
          s: unknown;
        }[]
      >`
          SELECT r.method::text AS method, u.full_name AS by, r.reason, COALESCE(tr.status = 'cancelled', FALSE) AS trip_cancelled,
                 COUNT(*) n, SUM(r.amount) s
          FROM refunds r LEFT JOIN users u ON u.id = r.created_by
          LEFT JOIN tickets t ON t.id = r.ticket_id LEFT JOIN trips tr ON tr.id = t.trip_id
          WHERE r.created_at >= ${gte} AND r.created_at < ${lt}
            AND ${q.routeId ? Prisma.sql`tr.route_id = ${q.routeId}::uuid` : Prisma.sql`TRUE`}
          GROUP BY 1, 2, 3, 4`,
      this.prisma.$queryRaw<{ s: unknown }[]>`
          SELECT SUM(r.amount) s FROM refunds r LEFT JOIN tickets t ON t.id = r.ticket_id LEFT JOIN trips tr ON tr.id = t.trip_id
          WHERE r.created_at >= ${instantsOf(prev.from, prev.to).gte} AND r.created_at < ${instantsOf(prev.from, prev.to).lt}
            AND ${q.routeId ? Prisma.sql`tr.route_id = ${q.routeId}::uuid` : Prisma.sql`TRUE`}`,
      // Recorridos cancelados por la empresa (por fecha de salida) con lo que pasó con sus boletos
      this.prisma.$queryRaw<
        {
          id: string;
          trip_number: string;
          departure_at: Date;
          reason: string | null;
          route_code: string;
          tickets: unknown;
          amount: unknown;
          refunded: unknown;
          relocated: unknown;
          pending: unknown;
        }[]
      >`
          SELECT tr.id::text AS id, tr.trip_number, tr.departure_at, tr.cancel_reason AS reason, ro.code AS route_code,
                 COUNT(t.id) FILTER (WHERE t.status = 'cancelled') tickets,
                 SUM(t.total) FILTER (WHERE t.status = 'cancelled') amount,
                 (SELECT COALESCE(SUM(r.amount), 0) FROM refunds r JOIN tickets x ON x.id = r.ticket_id WHERE x.trip_id = tr.id) refunded,
                 COUNT(t.id) FILTER (WHERE t.status = 'cancelled' AND t.replaced_by IS NOT NULL) relocated,
                 COALESCE(SUM(t.refund_due), 0) pending
          FROM trips tr JOIN routes ro ON ro.id = tr.route_id LEFT JOIN tickets t ON t.trip_id = tr.id
          WHERE tr.status = 'cancelled' AND tr.trip_date >= ${toDate(q.from)} AND tr.trip_date <= ${toDate(q.to)} AND ${route}
          GROUP BY tr.id, ro.code ORDER BY tr.departure_at`,
      // Cambios de boleto por fecha del cambio (la diferencia y el cargo vienen en el evento)
      this.prisma.$queryRaw<
        {
          n: unknown;
          due: unknown;
          refund: unknown;
          fee: unknown;
          relocations: unknown;
        }[]
      >`
          SELECT COUNT(*) n,
                 SUM(COALESCE((e.detail->>'due')::numeric, 0)) due,
                 SUM(COALESCE((e.detail->>'refund')::numeric, 0)) refund,
                 SUM(COALESCE((e.detail->>'fee')::numeric, 0)) fee,
                 COUNT(*) FILTER (WHERE (e.detail->>'relocation')::boolean) relocations
          FROM ticket_events e JOIN tickets t ON t.id = e.ticket_id JOIN trips tr ON tr.id = t.trip_id
          WHERE e.type = 'changed' AND e.created_at >= ${gte} AND e.created_at < ${lt} AND ${route}`,
      this.prisma.route.findMany({
        select: { id: true, code: true, name: true },
      }),
      this.prisma.routeSchedule.findMany({
        select: {
          id: true,
          departureTime: true,
          route: { select: { id: true, code: true } },
        },
      }),
      this.settings.get('tickets.cancellation_hours'),
    ]);

    const now = this.rates(groups);
    const before = this.rates(prevGroups);
    const refundTotal = refunds.reduce((a, r) => a + toCents(num(r.s)), 0);
    const pending = companyTrips.reduce(
      (a, t) => a + toCents(num(t.pending)),
      0,
    );

    // Anticipación y motivos (cancelaciones del pasajero)
    const notice = NOTICE_BUCKETS.map((b) => ({
      key: b.key,
      label: b.label,
      tickets: 0,
      amount: 0,
    }));
    const reasons = new Map<
      string,
      { reason: string; tickets: number; amount: number }
    >();
    let inWindow = 0;
    let lateCancels = 0;
    const byCancelDay = new Map<string, number>();
    for (const c of passengerCancels) {
      const n = num(c.n);
      const hours = num(c.hours);
      const b = notice.find((x) => x.key === noticeBucket(hours))!;
      b.tickets += n;
      b.amount = fromCents(toCents(b.amount) + toCents(num(c.s)));
      if (hours >= cancellationHours) inWindow += n;
      else lateCancels += n;
      const key = normalizeReason(c.reason);
      const r = reasons.get(key) ?? {
        reason: (c.reason ?? 'Sin motivo').trim().replace(/\.$/, ''),
        tickets: 0,
        amount: 0,
      };
      r.tickets += n;
      r.amount = fromCents(toCents(r.amount) + toCents(num(c.s)));
      reasons.set(key, r);
      byCancelDay.set(c.day, (byCancelDay.get(c.day) ?? 0) + n);
    }

    // Reembolsos por origen, método y quién
    const refundBy = <K extends string>(
      key: (r: (typeof refunds)[number]) => K,
    ) => {
      const m = new Map<K, { tickets: number; amount: number }>();
      for (const r of refunds) {
        const k = key(r);
        const acc = m.get(k) ?? { tickets: 0, amount: 0 };
        acc.tickets += num(r.n);
        acc.amount = fromCents(toCents(acc.amount) + toCents(num(r.s)));
        m.set(k, acc);
      }
      return [...m.entries()]
        .map(([k, v]) => ({ key: k, ...v }))
        .sort((a, b) => b.amount - a.amount);
    };

    // Por día de salida y por ruta, por horario y por tipo de pasajero
    const groupRates = (key: (g: TicketGroup) => string | null) => {
      const m = new Map<string, TicketGroup[]>();
      for (const g of groups) {
        const k = key(g);
        if (k != null) m.set(k, [...(m.get(k) ?? []), g]);
      }
      return [...m.entries()].map(([k, gs]) => ({ key: k, ...this.rates(gs) }));
    };
    const routeName = new Map(routes.map((r) => [r.id, r]));
    const scheduleName = new Map(schedules.map((s) => [s.id, s]));

    const [ch] = changes;
    return {
      range: { from: q.from, to: q.to, timezone: tz },
      cancellationHours,
      summary: {
        ...now,
        inWindow,
        lateCancels,
        refunds: fromCents(refundTotal),
        companyTrips: companyTrips.length,
        companyTickets: companyTrips.reduce((a, t) => a + num(t.tickets), 0),
        pendingRefunds: fromCents(pending),
        changes: num(ch?.n),
        previous: {
          ...prev,
          cancelRate: before.cancelRate,
          noShowRate: before.noShowRate,
          refunds: num(prevRefunds[0]?.s),
        },
        change: {
          cancelRate:
            Math.round((now.cancelRate - before.cancelRate) * 10) / 10,
          noShowRate:
            Math.round((now.noShowRate - before.noShowRate) * 10) / 10,
        },
      },
      byDay: groupRates((g) => g.day)
        .sort((a, b) => a.key.localeCompare(b.key))
        .map((d) => ({
          date: d.key,
          cancelled: d.cancelled,
          noShow: d.noShow,
          sold: d.sold,
          cancelRate: d.cancelRate,
          noShowRate: d.noShowRate,
        })),
      notice,
      reasons: [...reasons.values()]
        .sort((a, b) => b.tickets - a.tickets)
        .slice(0, 15),
      byRoute: groupRates((g) => g.route_id)
        .map((r) => ({
          routeId: r.key,
          code: routeName.get(r.key)?.code ?? '—',
          name: routeName.get(r.key)?.name ?? '—',
          ...r,
        }))
        .sort(
          (a, b) => b.cancelRate + b.noShowRate - (a.cancelRate + a.noShowRate),
        ),
      bySchedule: groupRates((g) => g.schedule_id)
        .map((s) => {
          const sc = scheduleName.get(s.key);
          return {
            scheduleId: s.key,
            routeId: sc?.route.id ?? null,
            routeCode: sc?.route.code ?? '—',
            departureTime: sc ? timeKey(sc.departureTime) : '—',
            ...s,
          };
        })
        .filter((s) => s.sold >= 20)
        .sort((a, b) => b.noShowRate - a.noShowRate)
        .slice(0, 15),
      byPassengerType: groupRates((g) => g.type).sort(
        (a, b) => b.noShowRate - a.noShowRate,
      ),
      refunds: {
        byKind: refundBy<RefundKind>((r) =>
          refundKind(r.reason, r.trip_cancelled),
        ),
        byMethod: refundBy((r) => r.method),
        byUser: refundBy((r) => r.by ?? '—'),
      },
      companyTrips: companyTrips.map((t) => ({
        tripId: t.id,
        tripNumber: t.trip_number,
        routeCode: t.route_code,
        departureAt: t.departure_at,
        reason: t.reason,
        tickets: num(t.tickets),
        amount: num(t.amount),
        refunded: num(t.refunded),
        relocated: num(t.relocated),
        pending: num(t.pending),
      })),
      changes: {
        count: num(ch?.n),
        relocations: num(ch?.relocations),
        collected: num(ch?.due),
        returned: num(ch?.refund),
        fees: num(ch?.fee),
      },
      cancelsByDay: [...byCancelDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, tickets]) => ({ date, tickets })),
    };
  }
}
