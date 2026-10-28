import { describe, expect, it } from 'vitest';
import {
  efficiencyDropPct,
  fuelLoadError,
  fuelTotal,
  isLowEfficiency,
  measureLoads,
} from './fuel-rules.js';

const load = (
  id: string,
  odometerKm: number,
  quantity: number,
  isFullTank = true,
) => ({
  id,
  odometerKm,
  quantity,
  isFullTank,
});

describe('measureLoads', () => {
  it('el primer tanque lleno no tiene medida', () => {
    const m = measureLoads([load('a', 1000, 300)]);
    expect(m.get('a')).toEqual({
      tripKm: null,
      tripQuantity: null,
      efficiency: null,
    });
  });

  it('mide de tanque lleno a tanque lleno', () => {
    const m = measureLoads([load('a', 1000, 300), load('b', 1900, 300)]);
    expect(m.get('b')).toEqual({
      tripKm: 900,
      tripQuantity: 300,
      efficiency: 3,
    });
  });

  it('las parciales se acumulan al siguiente lleno', () => {
    const m = measureLoads([
      load('a', 1000, 300),
      load('b', 1400, 50, false),
      load('c', 2000, 250),
    ]);
    expect(m.get('b')?.efficiency).toBeNull();
    expect(m.get('c')).toEqual({
      tripKm: 1000,
      tripQuantity: 300,
      efficiency: 3.33,
    });
  });

  it('las parciales antes del primer lleno no cuentan', () => {
    const m = measureLoads([
      load('a', 500, 80, false),
      load('b', 1000, 300),
      load('c', 1600, 200),
    ]);
    expect(m.get('b')?.efficiency).toBeNull();
    expect(m.get('c')?.efficiency).toBe(3);
  });
});

describe('isLowEfficiency', () => {
  it('marca bajo al caer el umbral o más', () => {
    expect(efficiencyDropPct(2.55, 3)).toBe(15);
    expect(isLowEfficiency(2.55, 3, 15)).toBe(true);
    expect(isLowEfficiency(2.6, 3, 15)).toBe(false);
  });

  it('sin medida o sin esperado no hay alerta', () => {
    expect(isLowEfficiency(null, 3, 15)).toBe(false);
    expect(isLowEfficiency(2, null, 15)).toBe(false);
  });
});

describe('fuelLoadError', () => {
  const ok = { quantity: 200, unitPrice: 24.5, odometerKm: 5000 };

  it('acepta una carga válida', () => {
    expect(fuelLoadError(ok, 400, 4000)).toBeNull();
    expect(fuelLoadError(ok, null, null)).toBeNull();
  });

  it('no pasa la capacidad del tanque', () => {
    expect(fuelLoadError({ ...ok, quantity: 401 }, 400, null)).toMatch(
      /tanque/,
    );
  });

  it('el odómetro avanza respecto a la carga anterior', () => {
    expect(fuelLoadError(ok, 400, 5000)).toMatch(/odómetro/);
  });

  it('cantidad y precio positivos', () => {
    expect(fuelLoadError({ ...ok, quantity: 0 }, null, null)).toMatch(
      /cantidad/,
    );
    expect(fuelLoadError({ ...ok, unitPrice: 0 }, null, null)).toMatch(
      /precio/,
    );
  });
});

describe('fuelTotal', () => {
  it('redondea a centavos', () => {
    expect(fuelTotal(123.45, 24.399)).toBe(3012.06);
  });
});
