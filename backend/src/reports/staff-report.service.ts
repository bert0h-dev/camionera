import { BadRequestException, Injectable } from '@nestjs/common';
import { businessTimezone, toDate } from '../common/dates.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { fromCents, toCents } from '../tickets/money.js';
import { ReportRangeDto } from './dto/report.dto.js';
import {
  attendanceRate,
  ON_TIME_MINUTES,
  punctuality,
} from './fleet-staff-rules.js';
import { rangeError } from './report-rules.js';
import { instantsOf } from './sales-report.service.js';

const num = (v: unknown) => Number(v ?? 0);
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const name = (r: { first_name: string; last_name: string }) =>
  `${r.first_name} ${r.last_name}`;

/**
 * Personal: conductores (recorridos, horas, km, puntualidad, incidencias), cobradores (abordajes),
 * vendedores (ventas, comisión, diferencias de caja, cancelaciones) y asistencia del periodo.
 */
@Injectable()
export class StaffReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async staff(q: ReportRangeDto) {
    const err = rangeError(q.from, q.to);
    if (err) throw new BadRequestException(err);
    const { gte, lt } = instantsOf(q.from, q.to);
    const from = toDate(q.from);
    const to = toDate(q.to);

    type DriverRow = {
      id: string;
      first_name: string;
      last_name: string;
      trips: unknown;
      hours: unknown;
      km: unknown;
      delays: number[] | null;
      incidents: unknown;
      no_shows: unknown;
    };
    const [drivers, collectors, sellers, attendance, vendorPercent] =
      await Promise.all([
        this.prisma.$queryRaw<DriverRow[]>`
        SELECT s.id::text AS id, s.first_name, s.last_name, COUNT(tr.id) trips,
               SUM(EXTRACT(EPOCH FROM (tr.actual_arrival_at - tr.actual_departure_at)) / 3600) hours,
               SUM(CASE WHEN tr.end_odometer_km >= tr.start_odometer_km THEN tr.end_odometer_km - tr.start_odometer_km
                        ELSE COALESCE(r.distance_km, 0) END) km,
               ARRAY_AGG(ROUND(EXTRACT(EPOCH FROM (tr.actual_departure_at - tr.departure_at)) / 60)::int)
                 FILTER (WHERE tr.actual_departure_at IS NOT NULL) delays,
               (SELECT COUNT(*) FROM bus_incidents i JOIN trips t2 ON t2.id = i.trip_id
                 WHERE t2.driver_id = s.id AND t2.trip_date >= ${from} AND t2.trip_date <= ${to}) incidents,
               (SELECT COUNT(*) FROM tickets tk JOIN trips t3 ON t3.id = tk.trip_id
                 WHERE t3.driver_id = s.id AND tk.status = 'no_show' AND t3.trip_date >= ${from} AND t3.trip_date <= ${to}) no_shows
        FROM staff s
        JOIN trips tr ON tr.driver_id = s.id AND tr.status = 'completed' AND tr.trip_date >= ${from} AND tr.trip_date <= ${to}
        JOIN routes r ON r.id = tr.route_id
        GROUP BY s.id ORDER BY trips DESC`,
        this.prisma.$queryRaw<
          {
            id: string;
            first_name: string;
            last_name: string;
            trips: unknown;
            boarded: unknown;
          }[]
        >`
        SELECT s.id::text AS id, s.first_name, s.last_name,
               (SELECT COUNT(*) FROM trips t WHERE t.collector_id = s.id AND t.status = 'completed'
                 AND t.trip_date >= ${from} AND t.trip_date <= ${to}) trips,
               (SELECT COUNT(*) FROM tickets tk WHERE s.user_id IS NOT NULL AND tk.checked_in_by = s.user_id
                 AND tk.checked_in_at >= ${gte} AND tk.checked_in_at < ${lt}) boarded
        FROM staff s WHERE s.role = 'collector'`,
        // Vendedores: ventas por quien vendió, reembolsos y cancelaciones por quien las hizo, cajas por su dueño
        this.prisma.$queryRaw<
          {
            id: string;
            name: string;
            orders: unknown;
            tickets: unknown;
            sales: unknown;
            refunds: unknown;
            cancels: unknown;
            sessions: unknown;
            diff: unknown;
            diffs: unknown;
          }[]
        >`
        SELECT u.id::text AS id, u.full_name AS name,
               (SELECT COUNT(*) FROM orders o WHERE o.seller_id = u.id AND o.paid_at >= ${gte} AND o.paid_at < ${lt}) orders,
               (SELECT COUNT(*) FROM tickets t JOIN orders o ON o.id = t.order_id
                 WHERE o.seller_id = u.id AND o.paid_at >= ${gte} AND o.paid_at < ${lt} AND t.status NOT IN ('held', 'changed')) tickets,
               (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.recorded_by = u.id AND p.status = 'approved'
                 AND p.paid_at >= ${gte} AND p.paid_at < ${lt}) sales,
               (SELECT COALESCE(SUM(r.amount), 0) FROM refunds r WHERE r.created_by = u.id
                 AND r.created_at >= ${gte} AND r.created_at < ${lt}) refunds,
               (SELECT COUNT(*) FROM ticket_events e WHERE e.user_id = u.id AND e.type = 'cancelled'
                 AND e.created_at >= ${gte} AND e.created_at < ${lt}) cancels,
               (SELECT COUNT(*) FROM cash_sessions c WHERE c.user_id = u.id AND c.status = 'closed'
                 AND c.closed_at >= ${gte} AND c.closed_at < ${lt}) sessions,
               (SELECT COALESCE(SUM(c.difference), 0) FROM cash_sessions c WHERE c.user_id = u.id AND c.status = 'closed'
                 AND c.closed_at >= ${gte} AND c.closed_at < ${lt}) diff,
               (SELECT COUNT(*) FROM cash_sessions c WHERE c.user_id = u.id AND c.status = 'closed' AND c.difference <> 0
                 AND c.closed_at >= ${gte} AND c.closed_at < ${lt}) diffs
        FROM users u
        WHERE EXISTS (SELECT 1 FROM payments p WHERE p.recorded_by = u.id AND p.paid_at >= ${gte} AND p.paid_at < ${lt})
        ORDER BY sales DESC`,
        this.prisma.$queryRaw<
          {
            id: string;
            first_name: string;
            last_name: string;
            role: string;
            status: string;
            n: unknown;
            late_minutes: unknown;
            overtime: unknown;
          }[]
        >`
        SELECT s.id::text AS id, s.first_name, s.last_name, s.role::text AS role, a.status::text AS status, COUNT(*) n,
               SUM(a.late_minutes) late_minutes, SUM(a.overtime_minutes) overtime
        FROM staff_attendance a JOIN staff s ON s.id = a.staff_id
        WHERE a.attendance_date >= ${from} AND a.attendance_date <= ${to}
        GROUP BY 1, 2, 3, 4, 5`,
        this.settings.get('commissions.vendor_percent'),
      ]);

    const driverRows = drivers.map((d) => {
      const p = punctuality(d.delays ?? []);
      return {
        staffId: d.id,
        name: name(d),
        trips: num(d.trips),
        hours: round(num(d.hours)),
        km: Math.round(num(d.km)),
        ...p,
        incidents: num(d.incidents),
        noShows: num(d.no_shows),
      };
    });
    const allDelays = drivers.flatMap((d) => d.delays ?? []);

    const att = new Map<
      string,
      {
        staffId: string;
        name: string;
        role: string;
        counts: Record<string, number>;
        lateMinutes: number;
        overtimeMinutes: number;
      }
    >();
    for (const a of attendance) {
      const row = att.get(a.id) ?? {
        staffId: a.id,
        name: name(a),
        role: a.role,
        counts: {},
        lateMinutes: 0,
        overtimeMinutes: 0,
      };
      row.counts[a.status] = (row.counts[a.status] ?? 0) + num(a.n);
      row.lateMinutes += num(a.late_minutes);
      row.overtimeMinutes += num(a.overtime);
      att.set(a.id, row);
    }
    const attendanceRows = [...att.values()]
      .map((r) => {
        const c = {
          present: r.counts.present ?? 0,
          late: r.counts.late ?? 0,
          half_day: r.counts.half_day ?? 0,
          absent: r.counts.absent ?? 0,
          excused: r.counts.excused ?? 0,
        };
        return {
          staffId: r.staffId,
          name: r.name,
          role: r.role,
          ...c,
          lateMinutes: r.lateMinutes,
          overtimeHours: round(r.overtimeMinutes / 60),
          rate: attendanceRate(c),
        };
      })
      .sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101));
    const totals = attendanceRows.reduce(
      (a, r) => ({
        present: a.present + r.present,
        late: a.late + r.late,
        half_day: a.half_day + r.half_day,
        absent: a.absent + r.absent,
        excused: a.excused + r.excused,
      }),
      { present: 0, late: 0, half_day: 0, absent: 0, excused: 0 },
    );

    const sellerRows = sellers.map((s) => {
      const net = fromCents(toCents(num(s.sales)) - toCents(num(s.refunds)));
      return {
        userId: s.id,
        name: s.name,
        orders: num(s.orders),
        tickets: num(s.tickets),
        sales: num(s.sales),
        refunds: num(s.refunds),
        net,
        commission: fromCents(
          Math.max(0, Math.round((toCents(net) * vendorPercent) / 100)),
        ),
        cancellations: num(s.cancels),
        cashCloses: num(s.sessions),
        cashDifference: num(s.diff),
        closesWithDifference: num(s.diffs),
      };
    });

    return {
      range: { from: q.from, to: q.to, timezone: businessTimezone() },
      onTimeMinutes: ON_TIME_MINUTES,
      vendorPercent,
      summary: {
        drivers: driverRows.length,
        trips: driverRows.reduce((a, d) => a + d.trips, 0),
        drivingHours: round(driverRows.reduce((a, d) => a + d.hours, 0)),
        ...punctuality(allDelays),
        boarded: collectors.reduce((a, c) => a + num(c.boarded), 0),
        sellers: sellerRows.length,
        sales: fromCents(sellerRows.reduce((a, s) => a + toCents(s.net), 0)),
        cashDifference: fromCents(
          sellerRows.reduce((a, s) => a + toCents(s.cashDifference), 0),
        ),
        attendanceRate: attendanceRate(totals),
        absences: totals.absent,
        lateArrivals: totals.late,
      },
      drivers: driverRows,
      collectors: collectors
        .map((c) => ({
          staffId: c.id,
          name: name(c),
          trips: num(c.trips),
          boarded: num(c.boarded),
        }))
        .filter((c) => c.trips || c.boarded),
      sellers: sellerRows,
      attendance: attendanceRows,
    };
  }
}
