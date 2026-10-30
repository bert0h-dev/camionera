import { describe, expect, it } from 'vitest';
import {
  change,
  dayIn,
  daysOf,
  previousRange,
  rangeError,
  sumBy,
} from './report-rules.js';

describe('periodos', () => {
  it('valida el orden y el largo', () => {
    expect(rangeError('2026-11-01', '2026-11-30')).toBeNull();
    expect(rangeError('2026-11-30', '2026-11-01')).toMatch(/anterior/);
    expect(rangeError('2025-01-01', '2026-11-01')).toMatch(/366/);
  });
  it('lista los días y calcula el periodo anterior del mismo largo', () => {
    expect(daysOf('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(previousRange('2026-11-01', '2026-11-30')).toEqual({
      from: '2026-10-02',
      to: '2026-10-31',
    });
  });
  it('el día depende de la zona de la central', () => {
    const late = new Date('2026-11-02T05:30:00Z');
    expect(dayIn(late, 'America/Mexico_City')).toBe('2026-11-01');
    expect(dayIn(late, 'UTC')).toBe('2026-11-02');
  });
});

describe('sumBy y change', () => {
  it('suma en centavos y ordena', () => {
    expect(
      sumBy<'total' | 'n'>(
        [
          ['A', { total: 0.1, n: 1 }],
          ['B', { total: 5, n: 1 }],
          ['A', { total: 0.2, n: 1 }],
        ],
        'total',
      ),
    ).toEqual([
      { key: 'B', total: 5, n: 1 },
      { key: 'A', total: 0.3, n: 2 },
    ]);
  });
  it('cambio porcentual', () => {
    expect(change(120, 100)).toBe(20);
    expect(change(80, 100)).toBe(-20);
    expect(change(5, 0)).toBeNull();
  });
});
