import { zonedDateTime } from '../../common/dates.js';
import { computeAttendance, type ShiftWindow } from './attendance-rules.js';

const rules = {
  lateToleranceMinutes: 10,
  halfDayPercent: 50,
  overtimeThresholdMinutes: 30,
};
const at = (date: string, time: string) => zonedDateTime(date, time);

// Turno 06:00–14:00 con 30 min de comida (7.5 h programadas)
const morning: ShiftWindow = {
  startAt: at('2026-11-02', '06:00'),
  endAt: at('2026-11-02', '14:00'),
  breakMinutes: 30,
  isRestDay: false,
};

describe('computeAttendance', () => {
  it('a tiempo: presente, descuenta comida', () => {
    expect(
      computeAttendance(
        morning,
        at('2026-11-02', '05:55'),
        at('2026-11-02', '14:00'),
        rules,
      ),
    ).toEqual({
      status: 'present',
      lateMinutes: 0,
      workedMinutes: 455,
      overtimeMinutes: 0,
    });
  });

  it('retardo solo después de la tolerancia (10 min exactos no cuentan)', () => {
    expect(
      computeAttendance(morning, at('2026-11-02', '06:10'), null, rules).status,
    ).toBe('present');
    const late = computeAttendance(
      morning,
      at('2026-11-02', '06:11'),
      null,
      rules,
    );
    expect(late).toMatchObject({
      status: 'late',
      lateMinutes: 11,
      workedMinutes: 0,
    });
  });

  it('medio día si trabajó menos del 50 % del turno (gana sobre retardo)', () => {
    const r = computeAttendance(
      morning,
      at('2026-11-02', '06:30'),
      at('2026-11-02', '09:30'),
      rules,
    );
    expect(r).toMatchObject({
      status: 'half_day',
      lateMinutes: 30,
      workedMinutes: 150,
    });
  });

  it('extras solo si pasa el umbral, y cuentan desde el fin del turno', () => {
    expect(
      computeAttendance(
        morning,
        at('2026-11-02', '06:00'),
        at('2026-11-02', '14:30'),
        rules,
      ).overtimeMinutes,
    ).toBe(0);
    expect(
      computeAttendance(
        morning,
        at('2026-11-02', '06:00'),
        at('2026-11-02', '15:15'),
        rules,
      ).overtimeMinutes,
    ).toBe(75);
  });

  it('turno nocturno que cruza la medianoche', () => {
    const night: ShiftWindow = {
      startAt: at('2026-11-02', '22:00'),
      endAt: at('2026-11-03', '06:00'),
      breakMinutes: 0,
      isRestDay: false,
    };
    expect(
      computeAttendance(
        night,
        at('2026-11-02', '22:05'),
        at('2026-11-03', '07:00'),
        rules,
      ),
    ).toEqual({
      status: 'present',
      lateMinutes: 5,
      workedMinutes: 535,
      overtimeMinutes: 60,
    });
  });

  it('sin turno: presente, sin retardo ni extras', () => {
    expect(
      computeAttendance(
        null,
        at('2026-11-02', '09:00'),
        at('2026-11-02', '13:00'),
        rules,
      ),
    ).toEqual({
      status: 'present',
      lateMinutes: 0,
      workedMinutes: 240,
      overtimeMinutes: 0,
    });
  });
});
