import { describe, expect, it } from 'vitest';
import { bandOf, slotOf, tripOccupancy, weighted } from './occupancy-rules.js';

// GDL (0) → LEO (220) → QRO (410) → CDMX (625)
const km = [0, 220, 410, 625];
const seg = (board: number, alight: number, sold: number) => ({
  board,
  alight,
  sold,
  boarded: sold,
  noShow: 0,
  revenue: sold * 100,
});

describe('tripOccupancy', () => {
  it('lleno de origen a destino es 100 % por asiento-km y por asientos', () => {
    const o = tripOccupancy(40, km, [seg(0, 3, 40)]);
    expect(o.byKm).toBe(100);
    expect(o.bySeats).toBe(100);
    expect(o.legs).toEqual([40, 40, 40]);
  });
  it('con tramos los asientos pueden pasar de 100 %, el asiento-km no', () => {
    // 40 de GDL a LEO y otros 40 de LEO a CDMX: mismo asiento, dos boletos
    const o = tripOccupancy(40, km, [seg(0, 1, 40), seg(1, 3, 40)]);
    expect(o.bySeats).toBe(200);
    expect(o.byKm).toBe(100);
    expect(o.legs).toEqual([40, 40, 40]);
  });
  it('pondera por km: medio camión en el trecho corto pesa menos', () => {
    const o = tripOccupancy(40, km, [seg(0, 1, 20)]);
    expect(o.byKm).toBe(17.6); // 20×220 / (40×625)
    expect(o.legs).toEqual([20, 0, 0]);
  });
  it('sin km cada trecho pesa igual', () => {
    expect(tripOccupancy(10, [0, 0, 0], [seg(0, 1, 10)]).byKm).toBe(50);
  });
});

describe('agrupaciones', () => {
  it('franjas de 3 h, bandas y promedio ponderado', () => {
    expect([0, 5, 6, 23].map(slotOf)).toEqual([0, 1, 2, 7]);
    expect([10, 30, 70, 95].map(bandOf)).toEqual([
      'empty',
      'low',
      'mid',
      'full',
    ]);
    expect(
      weighted([
        { seatKmSold: 100, seatKmOffered: 100 },
        { seatKmSold: 0, seatKmOffered: 300 },
      ]),
    ).toBe(25);
  });
});
