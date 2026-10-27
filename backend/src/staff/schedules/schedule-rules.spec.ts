import { addDays, dateKey, toDate, zonedDateTime } from '../../common/dates.js';
import {
  validateSchedule,
  workedHours,
  type ScheduleLike,
} from './schedule-rules.js';

const limits = { maxShiftHours: 14, minRestHours: 8, maxWeeklyHours: 48 };

const shift = (
  date: string,
  start: string,
  end: string,
  breakMinutes = 0,
): ScheduleLike => {
  const endDate = end <= start ? dateKey(addDays(toDate(date), 1)) : date;
  return {
    scheduleDate: toDate(date),
    startAt: zonedDateTime(date, start),
    endAt: zonedDateTime(endDate, end),
    breakMinutes,
    isRestDay: false,
  };
};

describe('zonedDateTime', () => {
  it('convierte hora local de CDMX (UTC-6) a UTC', () => {
    expect(zonedDateTime('2026-11-02', '06:00').toISOString()).toBe(
      '2026-11-02T12:00:00.000Z',
    );
  });
});

describe('workedHours', () => {
  it('descuenta el descanso y soporta turnos nocturnos', () => {
    expect(workedHours(shift('2026-11-02', '06:00', '14:00', 30))).toBe(7.5);
    expect(workedHours(shift('2026-11-02', '22:00', '06:00'))).toBe(8);
  });

  it('día de descanso = 0', () => {
    expect(
      workedHours({
        startAt: null,
        endAt: null,
        breakMinutes: 0,
        isRestDay: true,
      }),
    ).toBe(0);
  });
});

describe('validateSchedule', () => {
  it('turno normal sin otros turnos es válido', () => {
    expect(
      validateSchedule(shift('2026-11-02', '06:00', '14:00'), [], limits),
    ).toEqual([]);
  });

  it('rechaza turnos más largos que el máximo', () => {
    const [msg] = validateSchedule(
      shift('2026-11-02', '05:00', '21:00'),
      [],
      limits,
    );
    expect(msg).toMatch(/16 h \(máximo 14 h\)/);
  });

  it('rechaza descanso insuficiente con el turno anterior y el siguiente', () => {
    const night = shift('2026-11-02', '22:00', '06:00'); // termina 03/11 06:00
    const tooSoon = shift('2026-11-03', '10:00', '18:00'); // solo 4 h después
    expect(validateSchedule(tooSoon, [night], limits)[0]).toMatch(
      /Descanso insuficiente: 4 h desde/,
    );
    expect(validateSchedule(night, [tooSoon], limits)[0]).toMatch(
      /Descanso insuficiente: 4 h antes/,
    );
  });

  it('acepta exactamente el descanso mínimo', () => {
    const a = shift('2026-11-02', '06:00', '14:00');
    const b = shift('2026-11-02', '22:00', '23:00');
    expect(validateSchedule(b, [a], limits)).toEqual([]);
  });

  it('detecta empalmes', () => {
    const a = shift('2026-11-02', '20:00', '04:00');
    const b = shift('2026-11-03', '02:00', '08:00');
    expect(
      validateSchedule(b, [a], limits).some((v) => v.includes('Se empalma')),
    ).toBe(true);
  });

  it('rechaza exceder las horas semanales (lunes a domingo)', () => {
    // lunes 02/11 a jueves 05/11 con 10 h diarias; el viernes llega a 50 h
    const week = ['02', '03', '04', '05'].map((d) =>
      shift(`2026-11-${d}`, '06:00', '16:00'),
    );
    const friday = shift('2026-11-06', '06:00', '16:00');
    expect(validateSchedule(friday, week, limits)[0]).toMatch(
      /suma 50 h \(máximo 48 h\)/,
    );

    // el lunes siguiente ya es otra semana
    const nextMonday = shift('2026-11-09', '06:00', '16:00');
    expect(validateSchedule(nextMonday, [...week, friday], limits)).toEqual([]);
  });

  it('el día de descanso siempre es válido', () => {
    const rest: ScheduleLike = {
      scheduleDate: toDate('2026-11-02'),
      startAt: null,
      endAt: null,
      breakMinutes: 0,
      isRestDay: true,
    };
    expect(validateSchedule(rest, [], limits)).toEqual([]);
  });
});
