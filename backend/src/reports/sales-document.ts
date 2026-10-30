// Documento exportable (Excel / PDF) del reporte de ventas.

import type { ReportDocument } from './report-export.js';
import type { SalesReportService } from './sales-report.service.js';

type Sales = Awaited<ReturnType<SalesReportService['sales']>>;

const METHODS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  mercadopago: 'Mercado Pago',
};
const CHANNELS: Record<string, string> = {
  counter: 'Taquilla',
  online: 'En línea',
};

const money = (v: number) =>
  `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function salesDocument(s: Sales, company: string): ReportDocument {
  const { summary: k } = s;
  return {
    title: 'Reporte de ventas',
    subtitle: `Del ${s.range.from} al ${s.range.to} (zona ${s.range.timezone}). Ventas por fecha de cobro; reembolsos en la fecha en que se hicieron.`,
    company,
    highlights: [
      ['Vendido', money(k.gross)],
      ['Reembolsos', money(k.refunds)],
      ['Neto', money(k.net)],
      ['Compras', k.orders.toLocaleString('es-MX')],
      ['Boletos', k.tickets.toLocaleString('es-MX')],
      ['Boleto promedio', money(k.avgTicket)],
      ['IVA en boletos', money(k.vat)],
      ['Descuentos por pasajero', money(k.passengerDiscounts)],
      ['Descuentos por promoción', money(k.promoDiscounts)],
      ['Neto del periodo anterior', money(k.previous.net)],
    ],
    tables: [
      {
        title: 'Por día',
        rows: s.days,
        columns: [
          { header: 'Día', kind: 'text', value: (r) => r.date },
          { header: 'Vendido', kind: 'money', value: (r) => r.gross },
          { header: 'Reembolsos', kind: 'money', value: (r) => r.refunds },
          { header: 'Neto', kind: 'money', value: (r) => r.net },
          { header: 'Boletos', kind: 'int', value: (r) => r.tickets },
        ],
      },
      {
        title: 'Por método de pago',
        rows: s.byMethod,
        columns: [
          {
            header: 'Método',
            kind: 'text',
            value: (r) => METHODS[r.method] ?? r.method,
          },
          { header: 'Ventas', kind: 'money', value: (r) => r.sales },
          { header: 'Reembolsos', kind: 'money', value: (r) => r.refunds },
          { header: 'Neto', kind: 'money', value: (r) => r.net },
        ],
      },
      {
        title: 'Por canal',
        rows: s.byChannel,
        columns: [
          {
            header: 'Canal',
            kind: 'text',
            value: (r) => CHANNELS[r.channel] ?? r.channel,
          },
          { header: 'Vendido', kind: 'money', value: (r) => r.gross },
        ],
      },
      {
        title: 'Por vendedor',
        rows: s.bySeller,
        columns: [
          { header: 'Vendedor', kind: 'text', value: (r) => r.name },
          { header: 'Compras', kind: 'int', value: (r) => r.orders },
          { header: 'Vendido', kind: 'money', value: (r) => r.gross },
          { header: 'Reembolsos', kind: 'money', value: (r) => r.refunds },
          { header: 'Neto', kind: 'money', value: (r) => r.net },
          {
            header: `Comisión (${s.vendorPercent} %)`,
            kind: 'money',
            value: (r) => r.commission,
          },
        ],
      },
      {
        title: 'Por ruta',
        rows: s.byRoute,
        columns: [
          { header: 'Clave', kind: 'text', value: (r) => r.code, width: 1.4 },
          { header: 'Ruta', kind: 'text', value: (r) => r.name },
          { header: 'Boletos', kind: 'int', value: (r) => r.tickets },
          { header: 'Importe', kind: 'money', value: (r) => r.revenue },
          { header: '% del total', kind: 'percent', value: (r) => r.share },
        ],
      },
      {
        title: 'Origen → destino',
        rows: s.byLeg,
        columns: [
          { header: 'Tramo', kind: 'text', value: (r) => r.leg },
          { header: 'Boletos', kind: 'int', value: (r) => r.tickets },
          { header: 'Importe', kind: 'money', value: (r) => r.revenue },
        ],
      },
      {
        title: 'Por tipo de pasajero',
        rows: s.byPassengerType,
        columns: [
          { header: 'Tipo', kind: 'text', value: (r) => r.type },
          { header: 'Boletos', kind: 'int', value: (r) => r.tickets },
          { header: 'Descuento', kind: 'money', value: (r) => r.discount },
          { header: 'Importe', kind: 'money', value: (r) => r.revenue },
        ],
      },
      {
        title: 'Por promoción',
        rows: s.byPromotion,
        columns: [
          { header: 'Clave', kind: 'text', value: (r) => r.code, width: 1.4 },
          { header: 'Promoción', kind: 'text', value: (r) => r.name },
          { header: 'Compras', kind: 'int', value: (r) => r.orders },
          { header: 'Descuento', kind: 'money', value: (r) => r.discount },
        ],
      },
    ],
  };
}
