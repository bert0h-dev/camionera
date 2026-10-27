import { describe, expect, it } from 'vitest';
import {
  criterionApplies,
  missingScores,
  periodsOverlap,
  weightedScore,
} from './evaluation-rules.js';

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe('weightedScore', () => {
  it('promedia con pesos', () => {
    expect(
      weightedScore([
        { weight: 1, score: 5 },
        { weight: 3, score: 3 },
      ]),
    ).toBe(3.5);
  });

  it('redondea a 2 decimales', () => {
    expect(
      weightedScore([
        { weight: 1, score: 5 },
        { weight: 1, score: 4 },
        { weight: 1, score: 4 },
      ]),
    ).toBe(4.33);
  });

  it('null si falta una calificación o no hay criterios', () => {
    expect(weightedScore([{ weight: 1, score: null }])).toBeNull();
    expect(weightedScore([])).toBeNull();
  });
});

describe('criterionApplies', () => {
  it('sin puestos aplica a todos', () => {
    expect(criterionApplies({ appliesTo: [], isActive: true }, 'driver')).toBe(true);
  });

  it('respeta los puestos y la desactivación', () => {
    expect(criterionApplies({ appliesTo: ['driver'], isActive: true }, 'vendor')).toBe(false);
    expect(criterionApplies({ appliesTo: ['driver'], isActive: true }, 'driver')).toBe(true);
    expect(criterionApplies({ appliesTo: [], isActive: false }, 'driver')).toBe(false);
  });
});

describe('missingScores', () => {
  it('lista los criterios sin calificar', () => {
    expect(missingScores([{ score: 3 }, { score: null }])).toHaveLength(1);
  });
});

describe('periodsOverlap', () => {
  it('detecta traslape inclusivo', () => {
    const a = { start: d('2026-01-01'), end: d('2026-06-30') };
    expect(periodsOverlap(a, { start: d('2026-06-30'), end: d('2026-12-31') })).toBe(true);
    expect(periodsOverlap(a, { start: d('2026-07-01'), end: d('2026-12-31') })).toBe(false);
  });
});
