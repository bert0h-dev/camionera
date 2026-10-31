// Boletos en PDF: uno por página en media carta, con el QR firmado.

import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

export interface TicketPdfCompany {
  name: string;
  legalName: string;
  rfc: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logo: { data: Buffer; contentType: string } | null;
}

export interface TicketPdfTicket {
  ticketNumber: string;
  orderNumber: string;
  qrToken: string;
  passengerName: string;
  passengerType: string;
  passengerDocument: string | null;
  seatNumber: string;
  tripNumber: string;
  routeName: string;
  busNumber: string | null;
  /** Andén en la terminal de origen; null si aborda en una parada o aún no se asigna */
  platform: string | null;
  board: {
    code: string;
    name: string;
    city: string;
    date: string;
    time: string;
  };
  alight: {
    code: string;
    name: string;
    city: string;
    date: string;
    time: string;
  };
  basePrice: number;
  discount: number;
  vat: number;
  serviceFee: number;
  total: number;
  soldAt: string;
}

export interface TicketPdfPolicy {
  checkinMinutes: number;
  cancellationHours: number;
  refundPercent: number;
}

const INDIGO = '#3730a3';
const AMBER = '#f59e0b';
const MUTED = '#6b7280';
const money = (n: number) =>
  `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** pdfkit solo dibuja PNG y JPG; un logo WebP se omite. */
const drawableLogo = (logo: TicketPdfCompany['logo']) =>
  logo && ['image/png', 'image/jpeg'].includes(logo.contentType)
    ? logo.data
    : null;

export async function ticketsPdf(
  tickets: TicketPdfTicket[],
  company: TicketPdfCompany,
  policy: TicketPdfPolicy,
): Promise<Buffer> {
  // Media carta vertical: 5.5 × 8.5 in
  const doc = new PDFDocument({
    size: [396, 612],
    margin: 28,
    autoFirstPage: false,
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) =>
    doc.on('end', () => resolve(Buffer.concat(chunks))),
  );
  const qrs = await Promise.all(
    tickets.map((t) =>
      QRCode.toBuffer(t.qrToken, {
        margin: 1,
        width: 260,
        errorCorrectionLevel: 'M',
      }),
    ),
  );
  const logo = drawableLogo(company.logo);
  const W = 396 - 56;

  tickets.forEach((t, i) => {
    doc.addPage();
    // Banda superior
    doc.rect(0, 0, 396, 78).fill(INDIGO);
    let textX = 28;
    if (logo) {
      doc.image(logo, 28, 14, { fit: [50, 50] });
      textX = 88;
    }
    doc
      .fill('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(15)
      .text(company.name, textX, 20, { width: 240 });
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#c7d2fe')
      .text('Boleto de pasajero', textX, 40);
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(AMBER)
      .text(t.ticketNumber, 250, 22, { width: 118, align: 'right' });
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor('#c7d2fe')
      .text(`Compra ${t.orderNumber}`, 250, 38, { width: 118, align: 'right' });

    // Tramo
    let y = 96;
    const col = (x: number, p: TicketPdfTicket['board'], label: string) => {
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(MUTED)
        .text(label.toUpperCase(), x, y);
      doc
        .font('Helvetica-Bold')
        .fontSize(22)
        .fillColor('#111827')
        .text(p.time, x, y + 10);
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(`${p.code} · ${p.city}`, x, y + 38, { width: 150 });
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(MUTED)
        .text(p.name, x, y + 50, { width: 150 });
      doc.text(p.date, x, y + 61, { width: 150 });
    };
    col(28, t.board, 'Sale');
    col(214, t.alight, 'Llega');
    doc
      .moveTo(170, y + 24)
      .lineTo(206, y + 24)
      .strokeColor(AMBER)
      .lineWidth(2)
      .stroke();

    // Pasajero y asiento
    y = 184;
    doc.roundedRect(28, y, W, 64, 6).fill('#eef2ff');
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor(MUTED)
      .text('PASAJERO', 40, y + 10);
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#111827')
      .text(t.passengerName, 40, y + 20, { width: 220 });
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED)
      .text(
        [t.passengerType, t.passengerDocument].filter(Boolean).join(' · '),
        40,
        y + 38,
        { width: 220 },
      );
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor(MUTED)
      .text('ASIENTO', 290, y + 10, { width: 60, align: 'center' });
    doc
      .font('Helvetica-Bold')
      .fontSize(26)
      .fillColor(INDIGO)
      .text(t.seatNumber, 290, y + 20, { width: 60, align: 'center' });

    // Datos del viaje
    y = 262;
    const row = (label: string, value: string, yy: number) => {
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(label, 28, yy);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#111827')
        .text(value, 120, yy, { width: 120 });
    };
    row('Ruta', t.routeName, y);
    row('Recorrido', t.tripNumber, y + 13);
    row(
      'Unidad / andén',
      `${t.busNumber ?? '—'} / ${t.platform ?? '—'}`,
      y + 26,
    );
    row('Vendido', t.soldAt, y + 39);

    // Importe
    const amt = (label: string, value: string, yy: number, bold = false) => {
      doc
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(bold ? 10 : 8)
        .fillColor(bold ? INDIGO : '#111827');
      doc.text(label, 28, yy, { width: 120 });
      doc.text(value, 148, yy, { width: 92, align: 'right' });
    };
    y = 328;
    amt('Tarifa', money(t.basePrice), y);
    let yy = y + 13;
    if (t.discount > 0) {
      amt('Descuento', `-${money(t.discount)}`, yy);
      yy += 13;
    }
    if (t.serviceFee > 0) {
      amt('Cargo por servicio', money(t.serviceFee), yy);
      yy += 13;
    }
    amt('IVA incluido', money(t.vat), yy);
    doc
      .moveTo(28, yy + 15)
      .lineTo(240, yy + 15)
      .strokeColor('#e5e7eb')
      .lineWidth(1)
      .stroke();
    amt('Total', money(t.total), yy + 21, true);

    // QR
    doc.image(qrs[i], 256, 262, { width: 112 });
    doc
      .font('Helvetica')
      .fontSize(6.5)
      .fillColor(MUTED)
      .text('Presenta este código al abordar', 256, 377, {
        width: 112,
        align: 'center',
      });

    // Condiciones y datos fiscales
    y = 470;
    doc
      .moveTo(28, y - 10)
      .lineTo(368, y - 10)
      .dash(3, { space: 3 })
      .strokeColor('#d1d5db')
      .stroke()
      .undash();
    doc
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .fillColor('#111827')
      .text('Condiciones', 28, y);
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor(MUTED)
      .text(
        [
          `Preséntate en la terminal ${policy.checkinMinutes} minutos antes de la salida.`,
          policy.cancellationHours > 0
            ? `Puedes cancelar hasta ${policy.cancellationHours} h antes de la salida con reembolso del ${policy.refundPercent} % (el cargo por servicio no se reembolsa).`
            : 'Este boleto no admite cancelación con reembolso.',
          'Boleto válido solo para el pasajero, la fecha, el tramo y el asiento indicados.',
        ].join('\n'),
        28,
        y + 12,
        { width: W, lineGap: 2 },
      );
    const fiscal = [
      company.legalName,
      company.rfc && `RFC ${company.rfc}`,
      company.address,
    ]
      .filter(Boolean)
      .join(' · ');
    const contact = [company.phone, company.email, company.website]
      .filter(Boolean)
      .join(' · ');
    doc
      .fontSize(6.5)
      .text([fiscal, contact].filter(Boolean).join('\n'), 28, 560, {
        width: W,
        align: 'center',
      });
  });

  doc.end();
  return done;
}
