import { describe, expect, it } from 'vitest';
import { TripStatus } from '../generated/prisma/enums.js';
import {
  departureDelayMinutes,
  transitionError,
  type TransitionTrip,
} from './status-rules.js';

const departureAt = new Date('2026-11-02T14:00:00Z');
const trip = (over: Partial<TransitionTrip> = {}): TransitionTrip => ({
  status: TripStatus.scheduled,
  departureAt,
  departed: false,
  hasBus: true,
  hasDriver: true,
  ...over,
});
const base = { now: new Date('2026-11-02T13:45:00Z'), boardingOpenMinutes: 30 };

describe('transitionError', () => {
  it('sigue la tabla de transiciones', () => {
    expect(
      transitionError(trip(), { ...base, to: TripStatus.boarding }),
    ).toBeNull();
    expect(
      transitionError(trip(), { ...base, to: TripStatus.completed }),
    ).toContain('no es válido');
    expect(
      transitionError(trip({ status: TripStatus.completed }), {
        ...base,
        to: TripStatus.cancelled,
      }),
    ).toContain('ya terminó');
  });

  it('abordar pide unidad, conductor y que ya esté abierto el abordaje', () => {
    expect(
      transitionError(trip({ hasDriver: false }), {
        ...base,
        to: TripStatus.boarding,
      }),
    ).toContain('Asigna');
    expect(
      transitionError(trip(), {
        ...base,
        now: new Date('2026-11-02T13:00:00Z'),
        to: TripStatus.boarding,
      }),
    ).toContain('30 min');
  });

  it('retrasar y cancelar piden motivo', () => {
    expect(
      transitionError(trip(), { ...base, to: TripStatus.delayed }),
    ).toContain('retraso');
    expect(
      transitionError(trip(), {
        ...base,
        to: TripStatus.delayed,
        reason: 'Tráfico',
      }),
    ).toBeNull();
    expect(
      transitionError(trip(), {
        ...base,
        to: TripStatus.cancelled,
        reason: ' ',
      }),
    ).toContain('cancelación');
  });

  it('un retraso antes de salir vuelve a abordar o se cancela; en ruta solo sigue o termina', () => {
    const before = trip({ status: TripStatus.delayed });
    expect(
      transitionError(before, { ...base, to: TripStatus.boarding }),
    ).toBeNull();
    expect(
      transitionError(before, {
        ...base,
        to: TripStatus.completed,
        endOdometerKm: 1,
      }),
    ).toContain('aún no sale');
    const onRoad = trip({ status: TripStatus.delayed, departed: true });
    expect(
      transitionError(onRoad, {
        ...base,
        to: TripStatus.cancelled,
        reason: 'x',
      }),
    ).toContain('ya salió');
    expect(
      transitionError(onRoad, { ...base, to: TripStatus.in_transit }),
    ).toBeNull();
  });

  it('terminar pide el odómetro de llegada', () => {
    const t = trip({ status: TripStatus.in_transit, departed: true });
    expect(transitionError(t, { ...base, to: TripStatus.completed })).toContain(
      'odómetro',
    );
    expect(
      transitionError(t, {
        ...base,
        to: TripStatus.completed,
        endOdometerKm: 120_500,
      }),
    ).toBeNull();
  });
});

describe('departureDelayMinutes', () => {
  it('minutos tarde, nunca negativos', () => {
    expect(departureDelayMinutes(departureAt, null)).toBeNull();
    expect(
      departureDelayMinutes(departureAt, new Date('2026-11-02T14:12:00Z')),
    ).toBe(12);
    expect(
      departureDelayMinutes(departureAt, new Date('2026-11-02T13:55:00Z')),
    ).toBe(0);
  });
});
