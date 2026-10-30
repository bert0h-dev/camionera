// Exportación genérica de reportes: un libro de Excel con una hoja por tabla y un PDF con las mismas tablas.

import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export type CellKind = 'text' | 'money' | 'int' | 'percent';

export interface ReportColumn<T> {
  header: string;
  kind: CellKind;
  value: (row: T) => string | number | null;
  /** Ancho relativo en el PDF */
  width?: number;
}

export interface ReportTable<T = unknown> {
  title: string;
  columns: ReportColumn<T>[];
  rows: T[];
}

export interface ReportDocument {
  title: string;
  subtitle: string;
  company: string;
  /** Cifras clave en la portada: [etiqueta, valor ya formateado] */
  highlights: [string, string][];
  tables: ReportTable<any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const INDIGO = '#3730a3';
const MUTED = '#6b7280';

const money = (v: number) =>
  `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const format = (kind: CellKind, v: string | number | null) => {
  if (v == null) return '-';
  if (kind === 'money') return money(Number(v));
  if (kind === 'percent') return `${Number(v).toLocaleString('es-MX')} %`;
  if (kind === 'int') return Number(v).toLocaleString('es-MX');
  return String(v);
};

/** Libro de Excel: hoja de resumen y una hoja por tabla, con formato de moneda. */
export async function reportXlsx(doc: ReportDocument): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = doc.company;
  const summary = wb.addWorksheet('Resumen');
  summary.addRow([doc.title]).font = { bold: true, size: 14 };
  summary.addRow([doc.subtitle]);
  summary.addRow([]);
  for (const [label, value] of doc.highlights) summary.addRow([label, value]);
  summary.getColumn(1).width = 32;
  summary.getColumn(2).width = 24;

  for (const t of doc.tables) {
    // Excel limita el nombre de la hoja a 31 caracteres y no acepta algunos símbolos
    const ws = wb.addWorksheet(
      t.title.replace(/[\\/*?:[\]]/g, '').slice(0, 31),
    );
    const header = ws.addRow(t.columns.map((c) => c.header));
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF3730A3' },
    };
    for (const r of t.rows) ws.addRow(t.columns.map((c) => c.value(r)));
    t.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = Math.max(
        12,
        c.header.length + 4,
        c.kind === 'text' ? 28 : 14,
      );
      if (c.kind === 'money') col.numFmt = '"$"#,##0.00';
      if (c.kind === 'int') col.numFmt = '#,##0';
      if (c.kind === 'percent') col.numFmt = '0.0" %"';
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** PDF carta horizontal con las cifras clave y cada tabla (las tablas largas siguen en otra página). */
export async function reportPdf(doc: ReportDocument): Promise<Buffer> {
  const pdf = new PDFDocument({
    size: 'LETTER',
    layout: 'landscape',
    margin: 36,
  });
  const chunks: Buffer[] = [];
  pdf.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) =>
    pdf.on('end', () => resolve(Buffer.concat(chunks))),
  );
  const W = 792 - 72;
  const bottom = 612 - 36;

  pdf.rect(0, 0, 792, 70).fill(INDIGO);
  pdf
    .fill('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(`${doc.title} · ${doc.company}`, 36, 20);
  pdf
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#c7d2fe')
    .text(doc.subtitle, 36, 42, { width: W });

  let y = 86;
  const boxW = W / Math.max(1, Math.min(doc.highlights.length, 5));
  doc.highlights.slice(0, 10).forEach(([label, value], i) => {
    const x = 36 + (i % 5) * boxW;
    const yy = y + Math.floor(i / 5) * 40;
    pdf
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(label.toUpperCase(), x, yy, { width: boxW - 8 });
    pdf
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor('#111827')
      .text(value, x, yy + 11, { width: boxW - 8 });
  });
  y += Math.ceil(Math.min(doc.highlights.length, 10) / 5) * 40 + 10;

  for (const t of doc.tables) {
    if (!t.rows.length) continue;
    const total = t.columns.reduce(
      (a, c) => a + (c.width ?? (c.kind === 'text' ? 3 : 1.4)),
      0,
    );
    const widths = t.columns.map(
      (c) => ((c.width ?? (c.kind === 'text' ? 3 : 1.4)) / total) * W,
    );
    const header = () => {
      let x = 36;
      pdf.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED);
      t.columns.forEach((c, i) => {
        pdf.text(c.header.toUpperCase(), x, y, {
          width: widths[i] - 6,
          align: c.kind === 'text' ? 'left' : 'right',
        });
        x += widths[i];
      });
      y += 13;
    };
    if (y + 60 > bottom) {
      pdf.addPage();
      y = 36;
    }
    pdf
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(INDIGO)
      .text(t.title, 36, y);
    y += 16;
    header();
    for (const r of t.rows) {
      if (y + 13 > bottom) {
        pdf.addPage();
        y = 36;
        header();
      }
      let x = 36;
      pdf.font('Helvetica').fontSize(8.5).fillColor('#111827');
      t.columns.forEach((c, i) => {
        pdf.text(format(c.kind, c.value(r)), x, y, {
          width: widths[i] - 6,
          align: c.kind === 'text' ? 'left' : 'right',
          lineBreak: false,
          height: 11,
          ellipsis: true,
        });
        x += widths[i];
      });
      y += 13;
    }
    y += 12;
  }
  pdf.end();
  return done;
}
