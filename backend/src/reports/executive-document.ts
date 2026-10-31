// Documento exportable (PDF de una página) del tablero ejecutivo.

import type { ExecutiveReportService } from './executive-report.service.js';
import type { ReportDocument } from './report-export.js';

type Executive = Awaited<ReturnType<ExecutiveReportService['executive']>>;

const money = (v: number | null) =>
  v == null
    ? '-'
    : `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v: number | null) =>
  v == null ? '-' : `${v.toLocaleString('es-MX')} %`;
/** Cambio relativo (%) o en puntos. */
const delta = (v: number | null, unit: '%' | 'pts') =>
  v == null ? '' : ` (${v > 0 ? '+' : ''}${v} ${unit})`;

export function executiveDocument(
  e: Executive,
  company: string,
): ReportDocument {
  const k = e.kpis;
  return {
    title: 'Tablero ejecutivo',
    subtitle: `Del ${e.range.from} al ${e.range.to}, contra el ${e.previous.from} al ${e.previous.to}.`,
    company,
    highlights: [
      ['Neto vendido', money(k.net) + delta(k.netChange, '%')],
      [
        'Boletos',
        k.tickets.toLocaleString('es-MX') + delta(k.ticketsChange, '%'),
      ],
      ['Ocupación', pct(k.occupancy) + delta(k.occupancyChange, 'pts')],
      ['Cancelación', pct(k.cancelRate) + delta(k.cancelRateChange, 'pts')],
      ['No presentados', pct(k.noShowRate) + delta(k.noShowRateChange, 'pts')],
      ['Km recorridos', k.km.toLocaleString('es-MX') + delta(k.kmChange, '%')],
      ['Costo por km', money(k.costPerKm) + delta(k.costPerKmChange, '%')],
      ['Salidas a tiempo', pct(k.onTimeRate)],
      ['Asistencia', pct(k.attendanceRate)],
      ['Recorridos', k.trips.toLocaleString('es-MX')],
    ],
    tables: [
      {
        title: `Rutas con ocupación menor a ${e.thresholds.lowOccupancy} %`,
        rows: e.flags.lowOccupancyRoutes,
        columns: [
          {
            header: 'Ruta',
            kind: 'text',
            value: (r) => `${r.code} · ${r.name}`,
          },
          { header: 'Recorridos', kind: 'int', value: (r) => r.trips },
          { header: 'Ocupación', kind: 'percent', value: (r) => r.byKm },
        ],
      },
      {
        title: 'Unidades con rendimiento bajo',
        rows: e.flags.lowEfficiencyBuses,
        columns: [
          { header: 'Unidad', kind: 'text', value: (r) => r.number },
          {
            header: 'km/L',
            kind: 'text',
            value: (r) => String(r.efficiency ?? '-'),
          },
          {
            header: 'Esperado',
            kind: 'text',
            value: (r) => String(r.expected ?? '-'),
          },
          { header: 'Diferencia', kind: 'text', value: (r) => pct(r.gap) },
        ],
      },
      {
        title: `Horarios con ${e.thresholds.highNoShow} % o más de no presentados`,
        rows: e.flags.noShowSchedules,
        columns: [
          {
            header: 'Horario',
            kind: 'text',
            value: (r) => `${r.routeCode} ${r.departureTime}`,
          },
          { header: 'Vendidos', kind: 'int', value: (r) => r.sold },
          {
            header: 'No presentados',
            kind: 'percent',
            value: (r) => r.noShowRate,
          },
        ],
      },
      {
        title: 'Diferencias de caja',
        rows: e.flags.cashDifferences,
        columns: [
          { header: 'Vendedor', kind: 'text', value: (r) => r.name },
          {
            header: 'Cortes con diferencia',
            kind: 'int',
            value: (r) => r.closes,
          },
          { header: 'Diferencia', kind: 'money', value: (r) => r.difference },
        ],
      },
    ],
  };
}
