import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CancellationReportService } from './cancellation-report.service.js';
import { ReportRangeDto } from './dto/report.dto.js';
import { FleetReportService } from './fleet-report.service.js';
import { OccupancyReportService } from './occupancy-report.service.js';
import { change, previousRange } from './report-rules.js';
import { SalesReportService } from './sales-report.service.js';
import { StaffReportService } from './staff-report.service.js';

/** Ocupación por debajo de la cual una ruta es foco rojo. */
export const LOW_OCCUPANCY = 40;
/** No presentados a partir de los cuales un horario es foco rojo. */
export const HIGH_NO_SHOW = 15;
const FLAGS = 5;

/**
 * Tablero ejecutivo: las cifras clave de ventas, ocupación, cancelaciones, flota y personal
 * con su cambio contra el periodo anterior, más los focos rojos del periodo.
 */
@Injectable()
export class ExecutiveReportService {
  constructor(
    private readonly sales: SalesReportService,
    private readonly occupancy: OccupancyReportService,
    private readonly cancellations: CancellationReportService,
    private readonly fleet: FleetReportService,
    private readonly staff: StaffReportService,
  ) {}

  async executive(q: ReportRangeDto, user: AuthUser) {
    const prev = previousRange(q.from, q.to);
    const range = { from: q.from, to: q.to };
    // Cada reporte valida el periodo; el de ventas, ocupación y cancelaciones ya trae el anterior
    const [s, o, c, f, fp, st] = await Promise.all([
      this.sales.sales(range, user),
      this.occupancy.occupancy(range),
      this.cancellations.cancellations(range),
      this.fleet.fleet(range),
      this.fleet.fleet(prev),
      this.staff.staff(range),
    ]);

    return {
      range: s.range,
      previous: prev,
      kpis: {
        net: s.summary.net,
        netChange: s.summary.change.net,
        tickets: s.summary.tickets,
        ticketsChange: s.summary.change.tickets,
        occupancy: o.summary.byKm,
        occupancyChange: o.summary.change.byKm,
        trips: o.summary.trips,
        cancelRate: c.summary.cancelRate,
        cancelRateChange: c.summary.change.cancelRate,
        noShowRate: c.summary.noShowRate,
        noShowRateChange: c.summary.change.noShowRate,
        km: f.summary.km,
        kmChange: change(f.summary.km, fp.summary.km),
        costPerKm: f.summary.costPerKm,
        costPerKmChange:
          f.summary.costPerKm == null || fp.summary.costPerKm == null
            ? null
            : change(f.summary.costPerKm, fp.summary.costPerKm),
        onTimeRate: st.summary.onTimeRate,
        attendanceRate: st.summary.attendanceRate,
      },
      days: s.days.map((d) => ({
        date: d.date,
        net: d.net,
        tickets: d.tickets,
      })),
      flags: {
        lowOccupancyRoutes: o.byRoute
          .filter((r) => r.trips >= 5 && r.byKm < LOW_OCCUPANCY)
          .sort((a, b) => a.byKm - b.byKm)
          .slice(0, FLAGS)
          .map((r) => ({
            routeId: r.routeId,
            code: r.code,
            name: r.name,
            byKm: r.byKm,
            trips: r.trips,
          })),
        lowEfficiencyBuses: f.byBus
          .filter((b) => b.efficiencyGap != null && b.efficiencyGap <= -15)
          .sort((a, b) => (a.efficiencyGap ?? 0) - (b.efficiencyGap ?? 0))
          .slice(0, FLAGS)
          .map((b) => ({
            busId: b.busId,
            number: b.number,
            efficiency: b.efficiency,
            expected: b.expectedEfficiency,
            gap: b.efficiencyGap,
          })),
        noShowSchedules: c.bySchedule
          .filter((x) => x.noShowRate >= HIGH_NO_SHOW)
          .slice(0, FLAGS)
          .map((x) => ({
            scheduleId: x.scheduleId,
            routeCode: x.routeCode,
            departureTime: x.departureTime,
            noShowRate: x.noShowRate,
            sold: x.sold,
          })),
        cashDifferences: st.sellers
          .filter((x) => x.closesWithDifference > 0)
          .sort(
            (a, b) => Math.abs(b.cashDifference) - Math.abs(a.cashDifference),
          )
          .slice(0, FLAGS)
          .map((x) => ({
            userId: x.userId,
            name: x.name,
            closes: x.closesWithDifference,
            difference: x.cashDifference,
          })),
      },
      thresholds: { lowOccupancy: LOW_OCCUPANCY, highNoShow: HIGH_NO_SHOW },
    };
  }
}
