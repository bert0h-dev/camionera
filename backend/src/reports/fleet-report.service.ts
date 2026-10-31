import { BadRequestException, Injectable } from '@nestjs/common';
import { businessTimezone, toDate } from '../common/dates.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { costPerKm, efficiency, efficiencyGap } from './fleet-staff-rules.js';
import { ReportRangeDto } from './dto/report.dto.js';
import { rangeError } from './report-rules.js';
import { instantsOf } from './sales-report.service.js';

const num = (v: unknown) => Number(v ?? 0);
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * Flota: km recorridos (por odómetro de los recorridos terminados o estimados por la ruta), combustible,
 * mantenimiento, costo por km, incidencias y uso por unidad. Los recorridos cuentan por fecha de salida;
 * las cargas, órdenes e incidencias por su propia fecha.
 */
@Injectable()
export class FleetReportService {
  constructor(private readonly prisma: PrismaService) {}

  async fleet(q: ReportRangeDto) {
    const err = rangeError(q.from, q.to);
    if (err) throw new BadRequestException(err);
    const { gte, lt } = instantsOf(q.from, q.to);
    const dates = Prisma.sql`tr.trip_date >= ${toDate(q.from)} AND tr.trip_date <= ${toDate(q.to)}`;

    type BusRow = {
      id: string;
      number: string;
      plates: string;
      model: string;
      status: string;
      expected: unknown;
    };
    const [buses, trips, fuel, maint, preventive, incidents, incidentCats] =
      await Promise.all([
        this.prisma.$queryRaw<BusRow[]>`
        SELECT b.id::text AS id, b.economic_number AS number, b.plates, m.brand || ' ' || m.model AS model,
               b.status::text AS status, m.expected_efficiency AS expected
        FROM buses b JOIN bus_models m ON m.id = b.bus_model_id ORDER BY b.economic_number`,
        // Km por odómetro si el recorrido lo tiene completo; si no, los de la ruta (estimados)
        this.prisma.$queryRaw<
          {
            bus: string;
            trips: unknown;
            hours: unknown;
            km_real: unknown;
            km_est: unknown;
            est_trips: unknown;
          }[]
        >`
        SELECT tr.bus_id::text AS bus, COUNT(*) trips,
               SUM(EXTRACT(EPOCH FROM (tr.actual_arrival_at - tr.actual_departure_at)) / 3600) hours,
               SUM(CASE WHEN tr.end_odometer_km >= tr.start_odometer_km THEN tr.end_odometer_km - tr.start_odometer_km ELSE 0 END) km_real,
               SUM(CASE WHEN tr.end_odometer_km >= tr.start_odometer_km THEN 0 ELSE COALESCE(r.distance_km, 0) END) km_est,
               COUNT(*) FILTER (WHERE NOT (tr.end_odometer_km >= tr.start_odometer_km) OR tr.end_odometer_km IS NULL) est_trips
        FROM trips tr JOIN routes r ON r.id = tr.route_id
        WHERE tr.status = 'completed' AND tr.bus_id IS NOT NULL AND ${dates}
        GROUP BY 1`,
        this.prisma.$queryRaw<
          {
            bus: string;
            loads: unknown;
            liters: unknown;
            cost: unknown;
            km: unknown;
            measured: unknown;
          }[]
        >`
        SELECT f.bus_id::text AS bus, COUNT(*) loads, SUM(f.quantity) liters, SUM(f.total) cost,
               SUM(f.trip_km) FILTER (WHERE f.efficiency IS NOT NULL) km,
               SUM(f.trip_quantity) FILTER (WHERE f.efficiency IS NOT NULL) measured
        FROM fuel_loads f
        WHERE f.status = 'confirmed' AND f.loaded_at >= ${gte} AND f.loaded_at < ${lt}
        GROUP BY 1`,
        this.prisma.$queryRaw<
          {
            bus: string;
            type: string;
            orders: unknown;
            cost: unknown;
            days: unknown;
          }[]
        >`
        SELECT o.bus_id::text AS bus, o.type::text AS type, COUNT(*) orders,
               SUM(COALESCE(o.labor_cost, 0) + COALESCE(o.parts_cost, 0)) cost,
               SUM(EXTRACT(EPOCH FROM (o.completed_at - COALESCE(o.started_at, o.completed_at))) / 86400) days
        FROM maintenance_orders o
        WHERE o.status = 'completed' AND o.completed_at >= ${gte} AND o.completed_at < ${lt}
        GROUP BY 1, 2`,
        // Cumplimiento del preventivo: programados en el periodo (no cancelados) y cuántos se completaron
        this.prisma.$queryRaw<
          { planned: unknown; done: unknown; overdue: unknown }[]
        >`
        SELECT COUNT(*) planned, COUNT(*) FILTER (WHERE o.status = 'completed') done,
               COUNT(*) FILTER (WHERE o.status IN ('scheduled', 'in_progress') AND o.scheduled_date < CURRENT_DATE) overdue
        FROM maintenance_orders o
        WHERE o.type = 'preventive' AND o.status <> 'cancelled'
          AND o.scheduled_date >= ${toDate(q.from)} AND o.scheduled_date <= ${toDate(q.to)}`,
        this.prisma.$queryRaw<
          {
            bus: string;
            severity: string;
            n: unknown;
            resolved: unknown;
            hours: unknown;
          }[]
        >`
        SELECT i.bus_id::text AS bus, i.severity::text AS severity, COUNT(*) n,
               COUNT(*) FILTER (WHERE i.closed_at IS NOT NULL) resolved,
               SUM(EXTRACT(EPOCH FROM (i.closed_at - i.occurred_at)) / 3600) FILTER (WHERE i.closed_at IS NOT NULL) hours
        FROM bus_incidents i
        WHERE i.occurred_at >= ${gte} AND i.occurred_at < ${lt}
        GROUP BY 1, 2`,
        this.prisma.$queryRaw<{ category: string; n: unknown }[]>`
        SELECT c.name AS category, COUNT(*) n
        FROM bus_incidents i JOIN incident_categories c ON c.id = i.category_id
        WHERE i.occurred_at >= ${gte} AND i.occurred_at < ${lt}
        GROUP BY 1 ORDER BY n DESC`,
      ]);

    const byBus = buses.map((b) => {
      const t = trips.find((x) => x.bus === b.id);
      const f = fuel.find((x) => x.bus === b.id);
      const ms = maint.filter((x) => x.bus === b.id);
      const inc = incidents.filter((x) => x.bus === b.id);
      const km = num(t?.km_real) + num(t?.km_est);
      const fuelCost = num(f?.cost);
      const maintCost = ms.reduce((a, m) => a + num(m.cost), 0);
      const eff = efficiency(num(f?.km), num(f?.measured));
      const expected = b.expected == null ? null : num(b.expected);
      return {
        busId: b.id,
        number: b.number,
        plates: b.plates,
        model: b.model,
        status: b.status,
        trips: num(t?.trips),
        hours: round(num(t?.hours), 1),
        km: Math.round(km),
        kmEstimated: Math.round(num(t?.km_est)),
        estimatedTrips: num(t?.est_trips),
        fuelLoads: num(f?.loads),
        liters: round(num(f?.liters)),
        fuelCost: round(fuelCost),
        efficiency: eff,
        expectedEfficiency: expected,
        efficiencyGap: efficiencyGap(eff, expected),
        maintenanceOrders: ms.reduce((a, m) => a + num(m.orders), 0),
        preventive: num(ms.find((m) => m.type === 'preventive')?.orders),
        corrective: num(ms.find((m) => m.type === 'corrective')?.orders),
        maintenanceCost: round(maintCost),
        daysInShop: round(
          ms.reduce((a, m) => a + num(m.days), 0),
          1,
        ),
        incidents: inc.reduce((a, i) => a + num(i.n), 0),
        criticalIncidents: inc
          .filter((i) => i.severity === 'critical' || i.severity === 'high')
          .reduce((a, i) => a + num(i.n), 0),
        costPerKm: costPerKm(fuelCost + maintCost, km),
      };
    });

    const used = byBus.filter(
      (b) => b.trips || b.liters || b.maintenanceOrders || b.incidents,
    );
    const totalKm = byBus.reduce((a, b) => a + b.km, 0);
    const fuelCost = byBus.reduce((a, b) => a + b.fuelCost, 0);
    const maintCost = byBus.reduce((a, b) => a + b.maintenanceCost, 0);
    const kmMeasured = fuel.reduce((a, f) => a + num(f.km), 0);
    const litersMeasured = fuel.reduce((a, f) => a + num(f.measured), 0);
    const [p] = preventive;
    const resolved = incidents.reduce((a, i) => a + num(i.resolved), 0);
    const severity = ['low', 'medium', 'high', 'critical'].map((s) => ({
      severity: s,
      incidents: incidents
        .filter((i) => i.severity === s)
        .reduce((a, i) => a + num(i.n), 0),
    }));

    return {
      range: { from: q.from, to: q.to, timezone: businessTimezone() },
      summary: {
        buses: buses.length,
        activeBuses: byBus.filter((b) => b.trips > 0).length,
        idleBuses: byBus.filter(
          (b) => b.trips === 0 && b.status === 'available',
        ).length,
        trips: byBus.reduce((a, b) => a + b.trips, 0),
        km: totalKm,
        kmEstimated: byBus.reduce((a, b) => a + b.kmEstimated, 0),
        liters: round(byBus.reduce((a, b) => a + b.liters, 0)),
        fuelCost: round(fuelCost),
        efficiency: efficiency(kmMeasured, litersMeasured),
        maintenanceCost: round(maintCost),
        costPerKm: costPerKm(fuelCost + maintCost, totalKm),
        preventivePlanned: num(p?.planned),
        preventiveDone: num(p?.done),
        preventiveOverdue: num(p?.overdue),
        preventiveCompliance: num(p?.planned)
          ? round((num(p?.done) / num(p?.planned)) * 100, 1)
          : null,
        incidents: severity.reduce((a, s) => a + s.incidents, 0),
        avgResolutionHours: resolved
          ? round(incidents.reduce((a, i) => a + num(i.hours), 0) / resolved, 1)
          : null,
        lowEfficiency: byBus.filter(
          (b) => b.efficiencyGap != null && b.efficiencyGap <= -15,
        ).length,
      },
      byBus: used.sort((a, b) => b.km - a.km),
      idle: byBus
        .filter((b) => b.trips === 0)
        .map((b) => ({ busId: b.busId, number: b.number, status: b.status })),
      incidentsBySeverity: severity,
      incidentsByCategory: incidentCats.map((c) => ({
        category: c.category,
        incidents: num(c.n),
      })),
    };
  }
}
