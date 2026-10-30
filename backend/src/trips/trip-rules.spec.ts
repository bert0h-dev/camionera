import { describe, expect, it } from 'vitest';
import { TripStatus } from '../generated/prisma/enums.js';
import {
  dateRange,
  plannedTrips,
  syncPlan,
  tripNumber,
  type ExistingTrip,
  type PlanRoute,
} from './trip-rules.js';

const route = (over: Partial<PlanRoute> = {}): PlanRoute => ({
  id: 'r1',
  code: 'GDL-MEX',
  durationMinutes: 420,
  originTz: 'America/Mexico_City',
  isActive: true,
  schedules: [
    {
      id: 's1',
      departureTime: '07:30',
      daysOfWeek: [1, 2, 3, 4, 5],
      validFrom: '2026-01-01',
      validUntil: null,
      isActive: true,
    },
  ],
  ...over,
});

describe('tripNumber', () => {
  it('arma la clave con ruta, fecha corta y hora', () => {
    expect(tripNumber('GDL-MEX', '2026-10-30', '07:30')).toBe(
      'GDL-MEX-261030-0730',
    );
    expect(tripNumber('GDL-MEX', '2026-10-30', '07:30', 2)).toBe(
      'GDL-MEX-261030-0730-E2',
    );
  });
});

describe('dateRange', () => {
  it('incluye ambos extremos y cruza meses', () => {
    expect(dateRange('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });
});

describe('plannedTrips', () => {
  it('solo genera los días de la semana del horario', () => {
    // 2026-10-30 viernes, 31 sábado, 1 domingo, 2 lunes
    const trips = plannedTrips(route(), '2026-10-30', '2026-11-02');
    expect(trips.map((t) => t.tripDate)).toEqual(['2026-10-30', '2026-11-02']);
  });

  it('interpreta la hora en la zona del origen y suma la duración', () => {
    const [t] = plannedTrips(route(), '2026-10-30', '2026-10-30');
    // Centro de México = UTC−6 todo el año
    expect(t.departureAt.toISOString()).toBe('2026-10-30T13:30:00.000Z');
    expect(t.arrivalAt.toISOString()).toBe('2026-10-30T20:30:00.000Z');
    expect(t.tripNumber).toBe('GDL-MEX-261030-0730');
  });

  it('respeta el horario de verano de Tijuana', () => {
    const r = route({ originTz: 'America/Tijuana' });
    const [verano] = plannedTrips(r, '2026-10-30', '2026-10-30');
    const [invierno] = plannedTrips(r, '2026-11-02', '2026-11-02');
    expect(verano.departureAt.toISOString()).toBe('2026-10-30T14:30:00.000Z');
    expect(invierno.departureAt.toISOString()).toBe('2026-11-02T15:30:00.000Z');
  });

  it('no genera con la ruta inactiva, el horario inactivo o fuera de vigencia', () => {
    expect(
      plannedTrips(route({ isActive: false }), '2026-10-30', '2026-11-05'),
    ).toEqual([]);
    const s = route().schedules[0];
    expect(
      plannedTrips(
        route({ schedules: [{ ...s, isActive: false }] }),
        '2026-10-30',
        '2026-11-05',
      ),
    ).toEqual([]);
    const limited = plannedTrips(
      route({ schedules: [{ ...s, validUntil: '2026-11-02' }] }),
      '2026-10-30',
      '2026-11-05',
    );
    expect(limited.map((t) => t.tripDate)).toEqual([
      '2026-10-30',
      '2026-11-02',
    ]);
  });
});

describe('syncPlan', () => {
  const planned = plannedTrips(route(), '2026-10-30', '2026-11-02');
  const existing = (over: Partial<ExistingTrip>): ExistingTrip => ({
    id: 't1',
    routeScheduleId: 's1',
    tripDate: '2026-10-30',
    departureAt: planned[0].departureAt,
    arrivalAt: planned[0].arrivalAt,
    status: TripStatus.scheduled,
    assigned: false,
    ...over,
  });

  it('deja en paz los que coinciden', () => {
    expect(syncPlan([existing({})], planned)).toEqual({
      remove: [],
      stale: [],
    });
  });

  it('borra los sin asignar que ya no tocan o cambiaron de hora', () => {
    const moved = existing({
      id: 't2',
      departureAt: new Date('2026-10-30T14:00:00Z'),
    });
    const gone = existing({ id: 't3', tripDate: '2026-10-31' });
    expect(syncPlan([moved, gone], planned)).toEqual({
      remove: ['t2', 't3'],
      stale: [],
    });
  });

  it('avisa los asignados en vez de borrarlos', () => {
    const gone = existing({ id: 't4', tripDate: '2026-10-31', assigned: true });
    expect(syncPlan([gone], planned)).toEqual({ remove: [], stale: ['t4'] });
  });

  it('no toca los que ya no están programados', () => {
    const cancelled = existing({
      id: 't5',
      tripDate: '2026-10-31',
      status: TripStatus.cancelled,
    });
    expect(syncPlan([cancelled], planned)).toEqual({ remove: [], stale: [] });
  });
});
