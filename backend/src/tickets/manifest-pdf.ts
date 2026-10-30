// Manifiesto de pasajeros en PDF (carta): el documento que viaja a bordo.

import PDFDocument from 'pdfkit';

const INDIGO = '#3730a3';
const MUTED = '#6b7280';

const hour = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat('es-MX', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);
const day = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat('es-MX', { timeZone, dateStyle: 'full' }).format(d);

const STATUS: Record<string, string> = {
  confirmed: '',
  checked_in: 'Abordó',
  no_show: 'No se presentó',
};

export interface ManifestInput {
  trip: {
    tripNumber: string;
    departureAt: Date;
    route: { code: string; name: string };
    bus: string | null;
    driver: string | null;
    collector: string | null;
    origin: { code: string; cityName: string; timezone: string };
    destination: { code: string; cityName: string };
  };
  totals: { expected: number; boarded: number; noShow: number };
  stops: {
    code: string;
    name: string;
    cityName: string;
    timezone: string;
    at: Date;
    passengers: {
      seatNumber: string;
      passengerName: string;
      passengerDocument: string | null;
      status: string;
      ticketNumber: string;
      passengerType: { name: string };
      alightTerminal: { code: string };
    }[];
  }[];
}

export async function manifestPdf(
  m: ManifestInput,
  company: string,
): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) =>
    doc.on('end', () => resolve(Buffer.concat(chunks))),
  );
  const tz = m.trip.origin.timezone;

  doc.rect(0, 0, 612, 80).fill(INDIGO);
  doc
    .fill('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(`Manifiesto de pasajeros · ${company}`, 40, 20);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#c7d2fe')
    .text(
      `${m.trip.route.code} · ${m.trip.route.name} · ${m.trip.tripNumber} · sale ${hour(m.trip.departureAt, tz)} del ${day(m.trip.departureAt, tz)}`,
      40,
      44,
      { width: 532 },
    );

  let y = 96;
  const pair = (label: string, value: string, x: number) => {
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(label.toUpperCase(), x, y);
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#111827')
      .text(value, x, y + 10, { width: 125 });
  };
  pair('Unidad', m.trip.bus ?? '-', 40);
  pair('Conductor', m.trip.driver ?? '-', 170);
  pair('Cobrador', m.trip.collector ?? '-', 300);
  pair(
    'Pasajeros',
    `${m.totals.boarded} abordaron de ${m.totals.expected}`,
    430,
  );
  y += 40;

  const cols = [
    { label: 'Asiento', x: 40, w: 45 },
    { label: 'Pasajero', x: 88, w: 170 },
    { label: 'Tipo · identificación', x: 262, w: 130 },
    { label: 'Baja', x: 396, w: 40 },
    { label: 'Boleto', x: 440, w: 62 },
    { label: 'Estado', x: 506, w: 66 },
  ];
  const header = () => {
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED);
    for (const c of cols)
      doc.text(c.label.toUpperCase(), c.x, y, { width: c.w });
    y += 12;
  };
  const ensure = (h: number) => {
    if (y + h > 740) {
      doc.addPage();
      y = 40;
      header();
    }
  };

  for (const s of m.stops) {
    ensure(40);
    doc.rect(40, y, 532, 18).fill('#eef2ff');
    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor(INDIGO)
      .text(
        `Suben en ${s.code} · ${s.cityName} (${s.name}) · ${hour(s.at, s.timezone)}  —  ${s.passengers.length} pasajero(s)`,
        46,
        y + 5,
        {
          width: 520,
        },
      );
    y += 24;
    header();
    for (const p of s.passengers) {
      ensure(16);
      doc.font('Helvetica').fontSize(9).fillColor('#111827');
      doc.text(p.seatNumber, cols[0].x, y, { width: cols[0].w });
      doc.text(p.passengerName, cols[1].x, y, {
        width: cols[1].w,
        lineBreak: false,
        height: 11,
        ellipsis: true,
      });
      doc
        .fillColor(MUTED)
        .text(
          [p.passengerType.name, p.passengerDocument]
            .filter(Boolean)
            .join(' · '),
          cols[2].x,
          y,
          {
            width: cols[2].w,
            lineBreak: false,
            height: 11,
            ellipsis: true,
          },
        );
      doc
        .fillColor('#111827')
        .text(p.alightTerminal.code, cols[3].x, y, { width: cols[3].w });
      doc
        .fillColor(MUTED)
        .text(p.ticketNumber, cols[4].x, y, { width: cols[4].w });
      if (STATUS[p.status])
        doc
          .fillColor('#111827')
          .text(STATUS[p.status], cols[5].x, y, { width: cols[5].w });
      else
        doc
          .rect(cols[5].x, y - 1, 9, 9)
          .strokeColor('#9ca3af')
          .stroke();
      y += 15;
    }
    y += 8;
  }
  if (!m.stops.length)
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(MUTED)
      .text('El recorrido no tiene pasajeros.', 40, y);

  ensure(70);
  const sy = Math.max(y + 40, 680);
  doc.moveTo(70, sy).lineTo(270, sy).strokeColor('#9ca3af').stroke();
  doc.moveTo(342, sy).lineTo(542, sy).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  doc.text(`Conductor: ${m.trip.driver ?? ''}`, 70, sy + 6, {
    width: 200,
    align: 'center',
  });
  doc.text('Despachador', 342, sy + 6, { width: 200, align: 'center' });

  doc.end();
  return done;
}
