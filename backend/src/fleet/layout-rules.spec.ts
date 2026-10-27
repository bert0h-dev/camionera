import { describe, expect, it } from 'vitest';
import {
  defaultLayout,
  renumber,
  seatCount,
  seatPosition,
  seatsOf,
  validateLayout,
  type BusLayout,
} from './layout-rules.js';

const tiny = (
  cells: BusLayout['floors'][number]['cells'],
  rows = 2,
  cols = 3,
): BusLayout => ({
  floors: [{ rows, cols, cells }],
});

describe('defaultLayout', () => {
  it('2 + pasillo + 2 con conductor, puerta y baño; numeración continua', () => {
    const l = defaultLayout(11);
    expect(validateLayout(l, 1)).toEqual([]);
    // 11 filas × 4 menos 2 (conductor y puerta) y 2 atrás (baño)
    expect(seatCount(l)).toBe(40);
    expect(
      seatsOf(l)
        .map((s) => s.number)
        .slice(0, 3),
    ).toEqual(['1', '2', '3']);
  });

  it('doble piso numera de corrido entre pisos', () => {
    const l = defaultLayout(10, 2);
    expect(validateLayout(l, 2)).toEqual([]);
    const numbers = seatsOf(l).map((s) => Number(s.number));
    expect(numbers.at(-1)).toBe(numbers.length);
  });
});

describe('validateLayout', () => {
  it('rechaza formato, pisos de más y celdas fuera de rango', () => {
    expect(validateLayout(null, 1)).toEqual([
      'El layout no tiene un formato válido',
    ]);
    expect(validateLayout(defaultLayout(10, 2), 1)).toEqual([
      'Este tipo de autobús solo tiene un piso',
    ]);
    expect(
      validateLayout(tiny([{ r: 5, c: 0, type: 'seat', number: '1' }]), 1),
    ).toContain('hay una celda fuera de la cuadrícula');
  });

  it('asientos repetidos, sin número, posiciones duplicadas y conductor doble', () => {
    const errors = validateLayout(
      tiny([
        { r: 0, c: 0, type: 'seat', number: '1' },
        { r: 0, c: 0, type: 'seat', number: '2' },
        { r: 1, c: 0, type: 'seat', number: '1' },
        { r: 1, c: 1, type: 'seat', number: ' ' },
        { r: 0, c: 1, type: 'driver' },
        { r: 0, c: 2, type: 'driver' },
      ]),
      1,
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        'la posición fila 1, columna 1 está repetida',
        'El asiento 1 está repetido',
        'hay un asiento sin número',
        'Solo puede haber un lugar de conductor',
      ]),
    );
  });

  it('exige al menos un asiento', () => {
    expect(validateLayout(tiny([{ r: 0, c: 1, type: 'aisle' }]), 1)).toEqual([
      'El layout debe tener al menos un asiento',
    ]);
  });
});

describe('renumber y seatPosition', () => {
  it('renumera en orden de fila y columna', () => {
    const l = renumber(
      tiny([
        { r: 1, c: 0, type: 'seat', number: 'x' },
        { r: 0, c: 2, type: 'seat', number: 'y' },
      ]),
    );
    expect(seatsOf(l).map((s) => [s.r, s.c, s.number])).toEqual([
      [0, 2, '1'],
      [1, 0, '2'],
    ]);
  });

  it('ventana en orillas, pasillo junto al pasillo y centro en otro caso', () => {
    const floor = {
      rows: 1,
      cols: 5,
      cells: [{ r: 0, c: 3, type: 'aisle' as const }],
    };
    expect(seatPosition(floor, { r: 0, c: 0 })).toBe('window');
    expect(seatPosition(floor, { r: 0, c: 2 })).toBe('aisle');
    expect(seatPosition(floor, { r: 0, c: 1 })).toBe('middle');
  });
});
