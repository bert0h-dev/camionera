// Documento exportable (Excel / PDF) del reporte de ocupación.

import type { OccupancyReportService } from './occupancy-report.service.js';
import type { ReportDocument } from './report-export.js';

type Occupancy = Awaited<ReturnType<OccupancyReportService['occupancy']>>;

const DAYS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];
const SHORT = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const pct = (v: number) => `${v.toLocaleString('es-MX')} %`;
const money = (v: number) =>
  `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function occupancyDocument(
  o: Occupancy,
  company: string,
): ReportDocument {
  const k = o.summary;
  return {
    title: 'Reporte de ocupación',
    subtitle: `Recorridos operados del ${o.range.from} al ${o.range.to} por día de salida. Ocupación por asiento-km: km ocupados entre km ofrecidos.`,
    company,
    highlights: [
      ['Ocupación (asiento-km)', pct(k.byKm)],
      ['Ocupación (asientos)', pct(k.bySeats)],
      ['Recorridos', k.trips.toLocaleString('es-MX')],
      ['Boletos', k.sold.toLocaleString('es-MX')],
      ['Ingreso por recorrido', money(k.revenuePerTrip)],
      ['Abordaron', pct(k.boardedRate)],
      ['No se presentaron', pct(k.noShowRate)],
      ['Casi vacíos (< 25 %)', String(k.empty)],
      ['Casi llenos (≥ 90 %)', String(k.full)],
      ['Periodo anterior', pct(k.previous.byKm)],
    ],
    tables: [
      {
        title: 'Por día',
        rows: o.byDay,
        columns: [
          { header: 'Día', kind: 'text', value: (r) => r.date },
          { header: 'Recorridos', kind: 'int', value: (r) => r.trips },
          { header: 'Boletos', kind: 'int', value: (r) => r.sold },
          { header: 'Ocupación', kind: 'percent', value: (r) => r.byKm },
        ],
      },
      {
        title: 'Por ruta',
        rows: o.byRoute,
        columns: [
          { header: 'Clave', kind: 'text', value: (r) => r.code, width: 1.4 },
          { header: 'Ruta', kind: 'text', value: (r) => r.name },
          { header: 'Recorridos', kind: 'int', value: (r) => r.trips },
          { header: 'Boletos', kind: 'int', value: (r) => r.sold },
          { header: 'Ocupación', kind: 'percent', value: (r) => r.byKm },
          {
            header: 'Ingreso/recorrido',
            kind: 'money',
            value: (r) => r.revenuePerTrip,
          },
        ],
      },
      {
        title: 'Por horario',
        rows: o.bySchedule,
        columns: [
          {
            header: 'Ruta',
            kind: 'text',
            value: (r) => r.routeCode,
            width: 1.4,
          },
          {
            header: 'Salida',
            kind: 'text',
            value: (r) => r.departureTime,
            width: 0.8,
          },
          {
            header: 'Días',
            kind: 'text',
            value: (r) => r.daysOfWeek.map((d: number) => SHORT[d]).join(' ') || '-',
            width: 1.2,
          },
          { header: 'Recorridos', kind: 'int', value: (r) => r.trips },
          { header: 'Boletos prom.', kind: 'int', value: (r) => r.avgSold },
          { header: 'Casi vacíos', kind: 'int', value: (r) => r.empty },
          { header: 'Ocupación', kind: 'percent', value: (r) => r.byKm },
        ],
      },
      {
        title: 'Día y franja horaria',
        rows: [...o.heatmap].sort(
          (a, b) => a.weekday - b.weekday || a.slot - b.slot,
        ),
        columns: [
          { header: 'Día', kind: 'text', value: (r) => DAYS[r.weekday] },
          {
            header: 'Franja',
            kind: 'text',
            value: (r) =>
              `${String(r.fromHour).padStart(2, '0')}:00–${String(r.fromHour + 3).padStart(2, '0')}:00`,
          },
          { header: 'Recorridos', kind: 'int', value: (r) => r.trips },
          { header: 'Ocupación', kind: 'percent', value: (r) => r.byKm },
        ],
      },
      {
        title: 'Por trecho',
        rows: o.byLeg.flatMap((r) =>
          r.legs.map((l) => ({ ...l, route: r.code })),
        ),
        columns: [
          { header: 'Ruta', kind: 'text', value: (r) => r.route, width: 1.4 },
          {
            header: 'Trecho',
            kind: 'text',
            value: (r) => `${r.from} → ${r.to}`,
          },
          { header: 'Km', kind: 'int', value: (r) => r.km },
          {
            header: 'Asientos ocupados prom.',
            kind: 'int',
            value: (r) => r.avgSeats,
          },
          { header: 'Ocupación', kind: 'percent', value: (r) => r.occupancy },
        ],
      },
      {
        title: 'Recorridos',
        rows: o.detail,
        columns: [
          { header: 'Fecha', kind: 'text', value: (r) => r.date, width: 1 },
          { header: 'Hora', kind: 'text', value: (r) => r.time, width: 0.7 },
          {
            header: 'Recorrido',
            kind: 'text',
            value: (r) => r.tripNumber,
            width: 2,
          },
          {
            header: 'Unidad',
            kind: 'text',
            value: (r) => r.bus ?? '-',
            width: 0.8,
          },
          { header: 'Asientos', kind: 'int', value: (r) => r.seats },
          { header: 'Boletos', kind: 'int', value: (r) => r.sold },
          { header: 'Abordaron', kind: 'int', value: (r) => r.boarded },
          { header: 'Ocupación', kind: 'percent', value: (r) => r.byKm },
          { header: 'Ingreso', kind: 'money', value: (r) => r.revenue },
        ],
      },
    ],
  };
}
