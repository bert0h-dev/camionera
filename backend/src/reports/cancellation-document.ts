// Documento exportable (Excel / PDF) del reporte de cancelaciones y no presentados.

import type { CancellationReportService } from './cancellation-report.service.js';
import type { ReportDocument } from './report-export.js';

type Cancellations = Awaited<
  ReturnType<CancellationReportService['cancellations']>
>;

const pct = (v: number) => `${v.toLocaleString('es-MX')} %`;
const money = (v: number) =>
  `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const KINDS: Record<string, string> = {
  passenger: 'Cancelación del pasajero',
  trip: 'Recorrido cancelado',
  change: 'Diferencia de un cambio',
};
const METHODS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  mercadopago: 'Mercado Pago',
};

export function cancellationDocument(
  c: Cancellations,
  company: string,
): ReportDocument {
  const k = c.summary;
  return {
    title: 'Cancelaciones y no presentados',
    subtitle: `Del ${c.range.from} al ${c.range.to}. Tasas por fecha de salida; anticipación, motivos y dinero por la fecha en que pasaron. Plazo de cancelación: ${c.cancellationHours} h.`,
    company,
    highlights: [
      ['Tasa de cancelación', pct(k.cancelRate)],
      ['Boletos cancelados', k.cancelled.toLocaleString('es-MX')],
      ['Tasa de no presentados', pct(k.noShowRate)],
      ['Ingreso de no presentados', money(k.noShowRevenue)],
      ['Reembolsado', money(k.refunds)],
      ['Fuera de plazo', k.lateCancels.toLocaleString('es-MX')],
      ['Recorridos cancelados', String(k.companyTrips)],
      ['Saldo por devolver', money(k.pendingRefunds)],
      ['Cambios de boleto', String(k.changes)],
      ['Cancelación periodo anterior', pct(k.previous.cancelRate)],
    ],
    tables: [
      {
        title: 'Por día de salida',
        rows: c.byDay,
        columns: [
          { header: 'Día', kind: 'text', value: (r) => r.date },
          { header: 'Vendidos', kind: 'int', value: (r) => r.sold },
          { header: 'Cancelados', kind: 'int', value: (r) => r.cancelled },
          {
            header: '% cancelación',
            kind: 'percent',
            value: (r) => r.cancelRate,
          },
          { header: 'No se presentaron', kind: 'int', value: (r) => r.noShow },
          {
            header: '% no presentados',
            kind: 'percent',
            value: (r) => r.noShowRate,
          },
        ],
      },
      {
        title: 'Anticipación',
        rows: c.notice,
        columns: [
          { header: 'Antes de la salida', kind: 'text', value: (r) => r.label },
          { header: 'Boletos', kind: 'int', value: (r) => r.tickets },
          { header: 'Importe', kind: 'money', value: (r) => r.amount },
        ],
      },
      {
        title: 'Motivos',
        rows: c.reasons,
        columns: [
          { header: 'Motivo', kind: 'text', value: (r) => r.reason },
          { header: 'Boletos', kind: 'int', value: (r) => r.tickets },
          { header: 'Importe', kind: 'money', value: (r) => r.amount },
        ],
      },
      {
        title: 'Por ruta',
        rows: c.byRoute,
        columns: [
          { header: 'Clave', kind: 'text', value: (r) => r.code, width: 1.4 },
          { header: 'Ruta', kind: 'text', value: (r) => r.name },
          { header: 'Vendidos', kind: 'int', value: (r) => r.sold },
          {
            header: '% cancelación',
            kind: 'percent',
            value: (r) => r.cancelRate,
          },
          {
            header: '% no presentados',
            kind: 'percent',
            value: (r) => r.noShowRate,
          },
          {
            header: 'Ingreso no presentados',
            kind: 'money',
            value: (r) => r.noShowRevenue,
          },
        ],
      },
      {
        title: 'Horarios con más no presentados',
        rows: c.bySchedule,
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
          { header: 'Vendidos', kind: 'int', value: (r) => r.sold },
          {
            header: '% no presentados',
            kind: 'percent',
            value: (r) => r.noShowRate,
          },
          {
            header: '% cancelación',
            kind: 'percent',
            value: (r) => r.cancelRate,
          },
        ],
      },
      {
        title: 'Por tipo de pasajero',
        rows: c.byPassengerType,
        columns: [
          { header: 'Tipo', kind: 'text', value: (r) => r.key },
          { header: 'Vendidos', kind: 'int', value: (r) => r.sold },
          {
            header: '% cancelación',
            kind: 'percent',
            value: (r) => r.cancelRate,
          },
          {
            header: '% no presentados',
            kind: 'percent',
            value: (r) => r.noShowRate,
          },
        ],
      },
      {
        title: 'Reembolsos por origen',
        rows: c.refunds.byKind,
        columns: [
          {
            header: 'Origen',
            kind: 'text',
            value: (r) => KINDS[r.key] ?? r.key,
          },
          { header: 'Reembolsos', kind: 'int', value: (r) => r.tickets },
          { header: 'Importe', kind: 'money', value: (r) => r.amount },
        ],
      },
      {
        title: 'Reembolsos por método',
        rows: c.refunds.byMethod,
        columns: [
          {
            header: 'Método',
            kind: 'text',
            value: (r) => METHODS[r.key] ?? r.key,
          },
          { header: 'Reembolsos', kind: 'int', value: (r) => r.tickets },
          { header: 'Importe', kind: 'money', value: (r) => r.amount },
        ],
      },
      {
        title: 'Recorridos cancelados por la empresa',
        rows: c.companyTrips,
        columns: [
          {
            header: 'Recorrido',
            kind: 'text',
            value: (r) => r.tripNumber,
            width: 2,
          },
          { header: 'Motivo', kind: 'text', value: (r) => r.reason ?? '-' },
          { header: 'Boletos', kind: 'int', value: (r) => r.tickets },
          { header: 'Saldo generado', kind: 'money', value: (r) => r.amount },
          { header: 'Reembolsado', kind: 'money', value: (r) => r.refunded },
          { header: 'Reubicados', kind: 'int', value: (r) => r.relocated },
          { header: 'Pendiente', kind: 'money', value: (r) => r.pending },
        ],
      },
    ],
  };
}
