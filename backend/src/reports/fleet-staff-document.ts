// Documentos exportables (Excel / PDF) de los reportes de flota y de personal.

import type { FleetReportService } from './fleet-report.service.js';
import type { ReportDocument } from './report-export.js';
import type { StaffReportService } from './staff-report.service.js';

type Fleet = Awaited<ReturnType<FleetReportService['fleet']>>;
type Staff = Awaited<ReturnType<StaffReportService['staff']>>;

const money = (v: number | null) =>
  v == null
    ? '-'
    : `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v: number | null) =>
  v == null ? '-' : `${v.toLocaleString('es-MX')} %`;
const SEVERITY: Record<string, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  critical: 'Crítica',
};

export function fleetDocument(f: Fleet, company: string): ReportDocument {
  const k = f.summary;
  return {
    title: 'Reporte de flota',
    subtitle: `Del ${f.range.from} al ${f.range.to}. Km de recorridos terminados (por odómetro o estimados por la ruta); combustible, mantenimiento e incidencias por su fecha.`,
    company,
    highlights: [
      ['Km recorridos', k.km.toLocaleString('es-MX')],
      ['Recorridos', k.trips.toLocaleString('es-MX')],
      ['Rendimiento', k.efficiency == null ? '-' : `${k.efficiency} km/L`],
      ['Combustible', money(k.fuelCost)],
      ['Mantenimiento', money(k.maintenanceCost)],
      ['Costo por km', money(k.costPerKm)],
      ['Preventivo cumplido', pct(k.preventiveCompliance)],
      ['Incidencias', String(k.incidents)],
      ['Unidades con rendimiento bajo', String(k.lowEfficiency)],
      ['Unidades sin recorridos', String(k.idleBuses)],
    ],
    tables: [
      {
        title: 'Por unidad',
        rows: f.byBus,
        columns: [
          {
            header: 'Unidad',
            kind: 'text',
            value: (r) => r.number,
            width: 0.8,
          },
          { header: 'Modelo', kind: 'text', value: (r) => r.model, width: 1.8 },
          { header: 'Recorridos', kind: 'int', value: (r) => r.trips },
          { header: 'Km', kind: 'int', value: (r) => r.km },
          { header: 'Litros', kind: 'int', value: (r) => r.liters },
          {
            header: 'km/L',
            kind: 'text',
            value: (r) => (r.efficiency == null ? '-' : String(r.efficiency)),
            width: 0.8,
          },
          {
            header: 'vs esperado',
            kind: 'text',
            value: (r) => pct(r.efficiencyGap),
            width: 1,
          },
          { header: 'Combustible', kind: 'money', value: (r) => r.fuelCost },
          {
            header: 'Mantenimiento',
            kind: 'money',
            value: (r) => r.maintenanceCost,
          },
          {
            header: 'Costo/km',
            kind: 'text',
            value: (r) => money(r.costPerKm),
            width: 1,
          },
          { header: 'Incidencias', kind: 'int', value: (r) => r.incidents },
        ],
      },
      {
        title: 'Incidencias por gravedad',
        rows: f.incidentsBySeverity,
        columns: [
          {
            header: 'Gravedad',
            kind: 'text',
            value: (r) => SEVERITY[r.severity] ?? r.severity,
          },
          { header: 'Incidencias', kind: 'int', value: (r) => r.incidents },
        ],
      },
      {
        title: 'Incidencias por categoría',
        rows: f.incidentsByCategory,
        columns: [
          { header: 'Categoría', kind: 'text', value: (r) => r.category },
          { header: 'Incidencias', kind: 'int', value: (r) => r.incidents },
        ],
      },
    ],
  };
}

export function staffDocument(s: Staff, company: string): ReportDocument {
  const k = s.summary;
  return {
    title: 'Reporte de personal',
    subtitle: `Del ${s.range.from} al ${s.range.to}. A tiempo = menos de ${s.onTimeMinutes} min de retraso en la salida.`,
    company,
    highlights: [
      ['Conductores con recorridos', String(k.drivers)],
      ['Recorridos', k.trips.toLocaleString('es-MX')],
      ['Horas de manejo', k.drivingHours.toLocaleString('es-MX')],
      ['Salidas a tiempo', pct(k.onTimeRate)],
      ['Retraso promedio', k.avgDelay == null ? '-' : `${k.avgDelay} min`],
      ['Pasajeros abordados', k.boarded.toLocaleString('es-MX')],
      ['Vendido neto', money(k.sales)],
      ['Diferencias de caja', money(k.cashDifference)],
      ['Asistencia', pct(k.attendanceRate)],
      ['Faltas', String(k.absences)],
    ],
    tables: [
      {
        title: 'Conductores',
        rows: s.drivers,
        columns: [
          { header: 'Conductor', kind: 'text', value: (r) => r.name },
          { header: 'Recorridos', kind: 'int', value: (r) => r.trips },
          { header: 'Horas', kind: 'int', value: (r) => r.hours },
          { header: 'Km', kind: 'int', value: (r) => r.km },
          {
            header: 'A tiempo',
            kind: 'text',
            value: (r) => pct(r.onTimeRate),
            width: 1,
          },
          {
            header: 'Retraso prom.',
            kind: 'text',
            value: (r) => (r.avgDelay == null ? '-' : `${r.avgDelay} min`),
            width: 1,
          },
          { header: 'Incidencias', kind: 'int', value: (r) => r.incidents },
        ],
      },
      {
        title: 'Cobradores',
        rows: s.collectors,
        columns: [
          { header: 'Cobrador', kind: 'text', value: (r) => r.name },
          { header: 'Recorridos', kind: 'int', value: (r) => r.trips },
          { header: 'Abordajes', kind: 'int', value: (r) => r.boarded },
        ],
      },
      {
        title: 'Vendedores',
        rows: s.sellers,
        columns: [
          { header: 'Vendedor', kind: 'text', value: (r) => r.name },
          { header: 'Compras', kind: 'int', value: (r) => r.orders },
          { header: 'Boletos', kind: 'int', value: (r) => r.tickets },
          { header: 'Neto', kind: 'money', value: (r) => r.net },
          {
            header: `Comisión (${s.vendorPercent} %)`,
            kind: 'money',
            value: (r) => r.commission,
          },
          {
            header: 'Cancelaciones',
            kind: 'int',
            value: (r) => r.cancellations,
          },
          { header: 'Cortes', kind: 'int', value: (r) => r.cashCloses },
          {
            header: 'Diferencia caja',
            kind: 'money',
            value: (r) => r.cashDifference,
          },
        ],
      },
      {
        title: 'Asistencia',
        rows: s.attendance,
        columns: [
          { header: 'Empleado', kind: 'text', value: (r) => r.name },
          { header: 'Asistencias', kind: 'int', value: (r) => r.present },
          { header: 'Retardos', kind: 'int', value: (r) => r.late },
          { header: 'Faltas', kind: 'int', value: (r) => r.absent },
          { header: 'Justificadas', kind: 'int', value: (r) => r.excused },
          {
            header: 'Min. de retardo',
            kind: 'int',
            value: (r) => r.lateMinutes,
          },
          {
            header: '% asistencia',
            kind: 'text',
            value: (r) => pct(r.rate),
            width: 1,
          },
        ],
      },
    ],
  };
}
