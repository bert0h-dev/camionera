import { describe, expect, it } from 'vitest';
import { SeasonType } from '../generated/prisma/enums.js';
import {
  applySeason,
  findSeasonClash,
  seasonErrors,
  seasonOn,
  seasonStatus,
  type SeasonWindow,
} from './season-rules.js';

const xmas: SeasonWindow = {
  id: 'x',
  name: 'Navidad',
  seasonType: SeasonType.holiday,
  validFrom: '2026-12-15',
  validUntil: '2027-01-06',
  priceModifierPercent: 25,
  isActive: true,
};

describe('seasonErrors', () => {
  it('acepta una temporada válida', () => {
    expect(seasonErrors(xmas)).toEqual([]);
  });
  it('exige el signo según el tipo', () => {
    expect(seasonErrors({ ...xmas, priceModifierPercent: -5 }).join()).toMatch(
      /sumar/,
    );
    expect(
      seasonErrors({
        ...xmas,
        seasonType: SeasonType.low,
        priceModifierPercent: 10,
      }).join(),
    ).toMatch(/restar/);
    expect(
      seasonErrors({
        ...xmas,
        seasonType: SeasonType.normal,
        priceModifierPercent: 3,
      }).join(),
    ).toMatch(/0 %/);
    expect(
      seasonErrors({
        ...xmas,
        seasonType: SeasonType.normal,
        priceModifierPercent: 0,
      }),
    ).toEqual([]);
  });
  it('rango del ajuste y fechas', () => {
    expect(seasonErrors({ ...xmas, priceModifierPercent: 250 }).join()).toMatch(
      /200/,
    );
    expect(seasonErrors({ ...xmas, validUntil: '2026-12-01' }).join()).toMatch(
      /anterior/,
    );
  });
});

describe('solapes', () => {
  it('choca si se cruzan las fechas, con extremos incluidos', () => {
    const c = {
      ...xmas,
      id: undefined,
      validFrom: '2027-01-06',
      validUntil: '2027-01-10',
    };
    expect(findSeasonClash(c, [xmas])?.id).toBe('x');
  });
  it('no choca con una inactiva, consigo misma ni con fechas contiguas', () => {
    expect(
      findSeasonClash({ ...xmas, id: 'y' }, [{ ...xmas, isActive: false }]),
    ).toBeNull();
    expect(findSeasonClash(xmas, [xmas])).toBeNull();
    expect(
      findSeasonClash(
        { ...xmas, id: 'y', validFrom: '2027-01-07', validUntil: '2027-01-31' },
        [xmas],
      ),
    ).toBeNull();
  });
});

describe('situación y temporada del día', () => {
  it('vigente, próxima, pasada e inactiva', () => {
    expect(seasonStatus(xmas, '2026-12-20')).toBe('current');
    expect(seasonStatus(xmas, '2026-12-14')).toBe('upcoming');
    expect(seasonStatus(xmas, '2027-01-07')).toBe('past');
    expect(seasonStatus({ ...xmas, isActive: false }, '2026-12-20')).toBe(
      'inactive',
    );
  });
  it('encuentra la temporada de la fecha del viaje', () => {
    expect(seasonOn([xmas], '2027-01-06')?.id).toBe('x');
    expect(seasonOn([xmas], '2027-01-07')).toBeNull();
  });
});

describe('applySeason', () => {
  it('redondea a peso entero', () => {
    expect(applySeason(820, -10)).toBe(738);
    expect(applySeason(230, 20)).toBe(276);
    expect(applySeason(339.5, null)).toBe(340);
    expect(applySeason(825, 25)).toBe(1031);
  });
});
