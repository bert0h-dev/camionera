import { describe, expect, it } from 'vitest';
import { TripStatus } from '../generated/prisma/enums.js';
import {
  canExtend,
  holdUntil,
  seatCountError,
  sellableError,
} from './hold-rules.js';
import { segmentBase, tripItinerary } from './itinerary-rules.js';

const now = new Date('2026-11-02T12:00:00Z');
const later = new Date('2026-11-02T15:00:00Z');
const trip = {
  status: TripStatus.scheduled,
  hasBus: true,
  departed: false,
};

describe('sellableError', () => {
  it('vende un recorrido programado con unidad antes de la subida', () => {
    expect(sellableError(trip, later, now)).toBeNull();
    expect(
      sellableError({ ...trip, status: TripStatus.boarding }, later, now),
    ).toBeNull();
  });
  it('sin unidad, ya salido, cancelado o con la subida pasada no se vende', () => {
    expect(sellableError({ ...trip, hasBus: false }, later, now)).toMatch(
      /unidad/,
    );
    expect(
      sellableError(
        { ...trip, status: TripStatus.delayed, departed: true },
        later,
        now,
      ),
    ).toMatch(/salió/);
    expect(
      sellableError({ ...trip, status: TripStatus.cancelled }, later, now),
    ).toMatch(/canceló/);
    expect(sellableError(trip, now, now)).toMatch(/pasó/);
  });
});

describe('apartado', () => {
  it('limita los asientos por compra', () => {
    expect(seatCountError(0, 10)).toMatch(/al menos/);
    expect(seatCountError(11, 10)).toMatch(/Máximo 10/);
    expect(seatCountError(3, 10)).toBeNull();
  });
  it('se extiende una sola vez', () => {
    const until = holdUntil(now, 10);
    expect(until).toEqual(new Date('2026-11-02T12:10:00Z'));
    expect(canExtend(now, until, 10)).toBe(true);
    const extended = new Date(until.getTime() + 10 * 60_000);
    expect(canExtend(now, extended, 10)).toBe(false);
  });
});

describe('tripItinerary', () => {
  const at = (name: string) => ({
    terminalId: name,
    code: name,
    name,
    cityName: name,
    timezone: 'America/Tijuana',
  });
  const points = tripItinerary(
    new Date('2026-11-02T14:00:00Z'),
    600,
    at('TIJ'),
    [{ ...at('MXL'), minutes: 150, priceFromOrigin: 390 }],
    { ...at('HMO'), priceFromOrigin: 820 },
  );
  it('pone índices e instantes; el destino usa la duración del recorrido', () => {
    expect(points.map((p) => [p.index, p.code, p.at.toISOString()])).toEqual([
      [0, 'TIJ', '2026-11-02T14:00:00.000Z'],
      [1, 'MXL', '2026-11-02T16:30:00.000Z'],
      [2, 'HMO', '2026-11-03T00:00:00.000Z'],
    ]);
  });
  it('la tarifa de un tramo es la diferencia de acumulados', () => {
    expect(segmentBase(points, 1, 2)).toBe(430);
    expect(segmentBase(points, 0, 2)).toBe(820);
  });
});
