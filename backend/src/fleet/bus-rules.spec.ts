import { describe, expect, it } from 'vitest';
import {
  busFitness,
  documentsSummary,
  odometerError,
  seatsFromLayout,
} from './bus-rules.js';
import { defaultLayout, seatCount } from './layout-rules.js';

const today = new Date('2026-10-27');
const doc = (
  type: 'insurance' | 'circulation_card',
  issue: string,
  expiry: string | null,
) => ({
  type,
  issueDate: new Date(issue),
  expiryDate: expiry ? new Date(expiry) : null,
});
const okDocs = [
  doc('insurance', '2026-01-01', '2027-01-01'),
  doc('circulation_card', '2026-01-01', null),
];

describe('busFitness', () => {
  it('es apta con documentos vigentes, disponible y terminal ubicada', () => {
    expect(
      busFitness(
        { status: 'available', terminalLocated: true, documents: okDocs },
        today,
      ),
    ).toEqual({
      fit: true,
      reasons: [],
    });
  });

  it('enumera todos los motivos cuando no es apta', () => {
    const r = busFitness(
      {
        status: 'maintenance',
        terminalLocated: false,
        documents: [doc('insurance', '2025-01-01', '2026-10-26')],
      },
      today,
    );
    expect(r.fit).toBe(false);
    expect(r.reasons).toHaveLength(4);
  });

  it('el documento vence al terminar su día', () => {
    const docs = [
      doc('insurance', '2026-01-01', '2026-10-27'),
      doc('circulation_card', '2026-01-01', null),
    ];
    expect(
      busFitness(
        { status: 'available', terminalLocated: true, documents: docs },
        today,
      ).fit,
    ).toBe(true);
  });
});

describe('documentsSummary', () => {
  it('solo cuenta el documento más reciente de cada tipo', () => {
    const docs = [
      doc('insurance', '2025-01-01', '2026-01-01'),
      doc('insurance', '2026-01-01', '2026-11-10'),
    ];
    expect(documentsSummary(docs, today, 30)).toEqual({
      expiring: 1,
      expired: 0,
    });
  });
});

describe('odometerError', () => {
  it('no permite bajar el odómetro', () => {
    expect(odometerError(1000, 999)).toMatch(/no puede bajar/);
    expect(odometerError(1000, 1000)).toBeNull();
    expect(odometerError(1000, 1500)).toBeNull();
    expect(odometerError(0, 1.5)).toMatch(/entero/);
  });
});

describe('seatsFromLayout', () => {
  it('copia todos los asientos con piso, posición y categoría', () => {
    const layout = defaultLayout(10, 2);
    const seats = seatsFromLayout(layout);
    expect(seats).toHaveLength(seatCount(layout));
    expect(seats.some((s) => s.floor === 1)).toBe(true);
    expect(new Set(seats.map((s) => s.number)).size).toBe(seats.length);
  });
});
