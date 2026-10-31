import { describe, expect, it } from 'vitest';
import {
  attendanceRate,
  costPerKm,
  delayMinutes,
  efficiency,
  efficiencyGap,
  punctuality,
  tripKm,
} from './fleet-staff-rules.js';

describe('flota', () => {
  it('km por odómetro o estimados por la ruta', () => {
    expect(tripKm(1000, 1625, 625)).toEqual({ km: 625, estimated: false });
    expect(tripKm(1000, null, 625)).toEqual({ km: 625, estimated: true });
    expect(tripKm(1000, 900, 625)).toEqual({ km: 625, estimated: true });
    expect(tripKm(null, null, null)).toEqual({ km: 0, estimated: true });
  });
  it('costo por km y rendimiento', () => {
    expect(costPerKm(5000, 2000)).toBe(2.5);
    expect(costPerKm(5000, 0)).toBeNull();
    expect(efficiency(1200, 400)).toBe(3);
    expect(efficiency(1200, 0)).toBeNull();
    expect(efficiencyGap(2.4, 3)).toBe(-20);
    expect(efficiencyGap(null, 3)).toBeNull();
  });
});

describe('personal', () => {
  it('puntualidad: a tiempo con menos de 10 min de retraso', () => {
    expect(
      delayMinutes(
        new Date('2026-11-02T14:00:00Z'),
        new Date('2026-11-02T14:12:00Z'),
      ),
    ).toBe(12);
    expect(punctuality([0, 3, 9, 12, 30])).toEqual({
      onTimeRate: 60,
      avgDelay: 21,
      late: 2,
    });
    expect(punctuality([])).toEqual({
      onTimeRate: null,
      avgDelay: null,
      late: 0,
    });
  });
  it('asistencia: los justificados no cuentan y el medio día vale la mitad', () => {
    expect(
      attendanceRate({
        present: 18,
        late: 1,
        half_day: 2,
        absent: 1,
        excused: 3,
      }),
    ).toBe(90.9);
    expect(
      attendanceRate({
        present: 0,
        late: 0,
        half_day: 0,
        absent: 0,
        excused: 5,
      }),
    ).toBeNull();
  });
});
