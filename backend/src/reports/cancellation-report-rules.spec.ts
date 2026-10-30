import { describe, expect, it } from 'vitest';
import {
  noticeBucket,
  normalizeReason,
  rate,
  refundKind,
} from './cancellation-report-rules.js';

describe('reglas de cancelaciones', () => {
  it('rangos de anticipación', () => {
    expect([0.5, 2, 23.9, 24, 71, 72, 200].map(noticeBucket)).toEqual([
      'lt2',
      '2to24',
      '2to24',
      '1to3d',
      '1to3d',
      'gt3d',
      'gt3d',
    ]);
  });
  it('motivos normalizados', () => {
    expect(normalizeReason('  Cambio de Planes. ')).toBe('cambio de planes');
    expect(normalizeReason('Enfermedad')).toBe(normalizeReason('enfermedad.'));
    expect(normalizeReason('Él  ya   no viaja')).toBe('el ya no viaja');
    expect(normalizeReason(null)).toBe('sin motivo');
  });
  it('tasas y origen del reembolso', () => {
    expect(rate(7, 200)).toBe(3.5);
    expect(rate(1, 0)).toBe(0);
    expect(refundKind('Ya no viaja', false)).toBe('passenger');
    expect(refundKind('Recorrido cancelado · x', false)).toBe('trip');
    expect(refundKind('Ya no viaja', true)).toBe('trip');
    expect(
      refundKind('Diferencia a favor por cambio al boleto B1', false),
    ).toBe('change');
  });
});
