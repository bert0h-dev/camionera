import { describe, expect, it } from 'vitest';
import {
  daysLabel,
  findClash,
  normalizeDays,
  rangesOverlap,
  scheduleStatus,
  timeKey,
  timeValue,
  validityError,
  type ScheduleWindow,
} from './schedule-rules.js';

const base: ScheduleWindow = {
  id: 'a',
  departureTime: '08:00',
  daysOfWeek: [1, 2, 3, 4, 5],
  validFrom: '2026-11-01',
  validUntil: null,
  isActive: true,
};

describe('días y horas', () => {
  it('ordena y quita días repetidos', () => {
    expect(normalizeDays([5, 1, 1, 0])).toEqual([0, 1, 5]);
  });
  it('convierte la hora ida y vuelta', () => {
    expect(timeKey(timeValue('06:45'))).toBe('06:45');
  });
  it('nombra los atajos de días', () => {
    expect(daysLabel([0, 1, 2, 3, 4, 5, 6])).toBe('Diario');
    expect(daysLabel([5, 4, 3, 2, 1])).toBe('Lunes a viernes');
    expect(daysLabel([6, 0])).toBe('Fin de semana');
    expect(daysLabel([1, 3])).toBe('lunes, miércoles');
  });
});

describe('vigencia', () => {
  it('rechaza un fin anterior al inicio', () => {
    expect(validityError('2026-11-10', '2026-11-01')).toMatch(/anterior/);
    expect(validityError('2026-11-10', null)).toBeNull();
    expect(validityError('2026-11-10', '2026-11-10')).toBeNull();
  });
  it('cruza rangos, con fin indefinido', () => {
    expect(rangesOverlap('2026-01-01', '2026-01-31', '2026-01-31', null)).toBe(
      true,
    );
    expect(rangesOverlap('2026-01-01', '2026-01-30', '2026-01-31', null)).toBe(
      false,
    );
    expect(rangesOverlap('2026-03-01', null, '2026-01-01', null)).toBe(true);
  });
});

describe('choques', () => {
  it('choca a la misma hora con un día en común y vigencias cruzadas', () => {
    const c = { ...base, id: undefined, daysOfWeek: [5, 6] };
    expect(findClash(c, [base])?.id).toBe('a');
  });
  it('no choca con otra hora, otros días, otra vigencia o uno inactivo', () => {
    expect(
      findClash({ ...base, id: 'b', departureTime: '09:00' }, [base]),
    ).toBeNull();
    expect(
      findClash({ ...base, id: 'b', daysOfWeek: [0, 6] }, [base]),
    ).toBeNull();
    expect(
      findClash({ ...base, id: 'b' }, [
        { ...base, validUntil: '2026-10-31', validFrom: '2026-10-01' },
      ]),
    ).toBeNull();
    expect(
      findClash({ ...base, id: 'b' }, [{ ...base, isActive: false }]),
    ).toBeNull();
    expect(findClash({ ...base, id: 'b', isActive: false }, [base])).toBeNull();
  });
  it('no choca consigo mismo al editar', () => {
    expect(findClash(base, [base])).toBeNull();
  });
});

describe('situación', () => {
  it('vigente, próximo, vencido e inactivo', () => {
    expect(scheduleStatus(base, '2026-11-05')).toBe('current');
    expect(scheduleStatus(base, '2026-10-31')).toBe('upcoming');
    expect(
      scheduleStatus({ ...base, validUntil: '2026-11-04' }, '2026-11-05'),
    ).toBe('expired');
    expect(
      scheduleStatus({ ...base, validUntil: '2026-11-05' }, '2026-11-05'),
    ).toBe('current');
    expect(scheduleStatus({ ...base, isActive: false }, '2026-11-05')).toBe(
      'inactive',
    );
  });
});
