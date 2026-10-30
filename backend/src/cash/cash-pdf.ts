// Reporte de corte de caja en PDF (carta), para firmar y entregar con el efectivo.

import PDFDocument from 'pdfkit';
import type { CashTotals } from './cash-rules.js';

const INDIGO = '#3730a3';
const MUTED = '#6b7280';
const money = (n: number | string | null | undefined) =>
  n == null
    ? '-'
    : `${Number(n) < 0 ? '-' : ''}$${Math.abs(Number(n)).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (d: Date | null) =>
  d
    ? new Intl.DateTimeFormat('es-MX', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(d)
    : '—';

const METHODS = [
  ['cash', 'Efectivo'],
  ['card', 'Tarjeta'],
  ['transfer', 'Transferencia'],
] as const;

export interface CashReportInput {
  status: string;
  openingFloat: unknown;
  openedAt: Date;
  closedAt: Date | null;
  expectedCash: unknown;
  countedCash: unknown;
  difference: unknown;
  closingNotes: string | null;
  commissionPercent: unknown;
  commissionAmount: unknown;
  summary: unknown;
  user: { fullName: string };
  closedBy: { fullName: string } | null;
  terminal: { code: string; name: string } | null;
  movements: {
    type: string;
    method: string;
    amount: unknown;
    reason: string | null;
    createdAt: Date;
    order: { orderNumber: string } | null;
  }[];
  live: {
    totals: CashTotals;
    orders: number;
    tickets: number;
    commission: number;
    commissionPercent: number;
  };
}

const MOVEMENT_LABELS: Record<string, string> = {
  sale: 'Venta',
  refund: 'Reembolso',
  withdrawal: 'Retiro',
  deposit: 'Ingreso',
};

export async function cashReportPdf(
  s: CashReportInput,
  company: string,
): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'LETTER', margin: 48 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) =>
    doc.on('end', () => resolve(Buffer.concat(chunks))),
  );
  const closed = s.status === 'closed';
  const summary = (s.summary ?? null) as {
    totals: CashTotals;
    orders: number;
    tickets: number;
    breakdown: Record<string, number> | null;
  } | null;
  const totals = closed && summary ? summary.totals : s.live.totals;
  const orders = closed && summary ? summary.orders : s.live.orders;
  const tickets = closed && summary ? summary.tickets : s.live.tickets;

  doc.rect(0, 0, 612, 86).fill(INDIGO);
  doc.fill('#ffffff').font('Helvetica-Bold').fontSize(18).text(company, 48, 26);
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#c7d2fe')
    .text(closed ? 'Corte de caja' : 'Caja abierta (sin corte)', 48, 50);

  let y = 106;
  const pair = (label: string, value: string, x: number, yy: number) => {
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED)
      .text(label.toUpperCase(), x, yy);
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#111827')
      .text(value, x, yy + 11, { width: 160 });
  };
  pair('Vendedor', s.user.fullName, 48, y);
  pair('Abrió', when(s.openedAt), 220, y);
  pair(
    'Cortó',
    closed
      ? `${when(s.closedAt)}${s.closedBy ? ` · ${s.closedBy.fullName}` : ''}`
      : '—',
    392,
    y,
  );
  y += 40;
  pair(
    'Terminal',
    s.terminal ? `${s.terminal.code} · ${s.terminal.name}` : '—',
    48,
    y,
  );
  pair('Compras', String(orders), 220, y);
  pair('Boletos', String(tickets), 392, y);

  // Totales por método
  y += 52;
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(INDIGO)
    .text('Ventas por método', 48, y);
  y += 18;
  const row = (
    a: string,
    b: string,
    c: string,
    d: string,
    yy: number,
    bold = false,
  ) => {
    doc
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(9)
      .fillColor('#111827');
    doc.text(a, 48, yy, { width: 160 });
    doc.text(b, 210, yy, { width: 110, align: 'right' });
    doc.text(c, 330, yy, { width: 110, align: 'right' });
    doc.text(d, 450, yy, { width: 114, align: 'right' });
  };
  row('Método', 'Ventas', 'Reembolsos', 'Neto', y, true);
  for (const [k, label] of METHODS) {
    y += 15;
    row(
      label,
      money(totals.sales[k]),
      money(totals.refunds[k]),
      money(totals.sales[k] - totals.refunds[k]),
      y,
    );
  }
  y += 15;
  doc
    .moveTo(48, y + 2)
    .lineTo(564, y + 2)
    .strokeColor('#e5e7eb')
    .stroke();
  y += 8;
  row('Total', '', '', money(totals.netSales), y, true);

  // Arqueo de efectivo
  y += 30;
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(INDIGO)
    .text('Arqueo de efectivo', 48, y);
  y += 18;
  const line = (label: string, value: string, bold = false) => {
    doc
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(9)
      .fillColor('#111827');
    doc.text(label, 48, y, { width: 260 });
    doc.text(value, 310, y, { width: 120, align: 'right' });
    y += 15;
  };
  line('Fondo inicial', money(s.openingFloat as number));
  line('+ Ventas en efectivo', money(totals.sales.cash));
  line('- Reembolsos en efectivo', money(totals.refunds.cash));
  line('- Retiros', money(totals.withdrawals));
  line('+ Ingresos', money(totals.deposits));
  line(
    'Efectivo esperado',
    money(closed ? (s.expectedCash as number) : totals.expectedCash),
    true,
  );
  if (closed) {
    line('Efectivo contado', money(s.countedCash as number), true);
    const diff = Number(s.difference);
    line(
      diff === 0
        ? 'Diferencia'
        : diff > 0
          ? 'Diferencia (sobrante)'
          : 'Diferencia (faltante)',
      money(diff),
      true,
    );
    if (s.closingNotes) {
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(MUTED)
        .text(`Motivo: ${s.closingNotes}`, 48, y, { width: 516 });
      y = doc.y + 6;
    }
  }

  // Desglose
  if (closed && summary?.breakdown && Object.keys(summary.breakdown).length) {
    y += 8;
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#111827')
      .text('Desglose del efectivo', 48, y);
    y += 14;
    const parts = Object.entries(summary.breakdown)
      .filter(([, q]) => q > 0)
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .map(([d, q]) => `${q} × $${d} = ${money(Number(d) * q)}`);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED)
      .text(parts.join('   ·   '), 48, y, { width: 516 });
    y = doc.y + 6;
  }

  // Comisión
  y += 12;
  const pct = closed ? Number(s.commissionPercent) : s.live.commissionPercent;
  const amount = closed ? Number(s.commissionAmount) : s.live.commission;
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(INDIGO)
    .text('Comisión del vendedor', 48, y);
  y += 16;
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#111827')
    .text(`${pct} % sobre ${money(totals.netSales)} vendido neto`, 48, y);
  doc
    .font('Helvetica-Bold')
    .text(money(amount), 310, y, { width: 120, align: 'right' });
  y += 26;

  // Retiros e ingresos
  const manual = s.movements.filter(
    (m) => m.type === 'withdrawal' || m.type === 'deposit',
  );
  if (manual.length) {
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(INDIGO)
      .text('Retiros e ingresos', 48, y);
    y += 16;
    for (const m of manual) {
      doc.font('Helvetica').fontSize(8.5).fillColor('#111827');
      doc.text(when(m.createdAt), 48, y, { width: 110 });
      doc.text(MOVEMENT_LABELS[m.type], 160, y, { width: 60 });
      doc.text(m.reason ?? '', 222, y, { width: 220 });
      doc.text(money(m.amount as number), 450, y, {
        width: 114,
        align: 'right',
      });
      y += 13;
    }
  }

  // Firmas
  const sy = Math.max(y + 50, 640);
  doc.moveTo(70, sy).lineTo(270, sy).strokeColor('#9ca3af').stroke();
  doc.moveTo(342, sy).lineTo(542, sy).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  doc.text(`Entrega: ${s.user.fullName}`, 70, sy + 6, {
    width: 200,
    align: 'center',
  });
  doc.text('Recibe', 342, sy + 6, { width: 200, align: 'center' });

  doc.end();
  return done;
}
