import { describe, expect, it } from 'vitest';
import { TicketStatus, TripStatus } from '../generated/prisma/enums.js';
import { checkInError, noShows, undoError } from './boarding-rules.js';

const policy = { checkinMinutes: 30, graceMinutes: 15 };
const origin = {
  status: TicketStatus.confirmed,
  boardIndex: 0,
  boardAt: new Date('2026-11-02T14:00:00Z'),
};
const middle = {
  status: TicketStatus.confirmed,
  boardIndex: 1,
  boardAt: new Date('2026-11-02T16:30:00Z'),
};
const waiting = { status: TripStatus.boarding, actualDepartureAt: null };
const left = {
  status: TripStatus.in_transit,
  actualDepartureAt: new Date('2026-11-02T14:05:00Z'),
};
const at = (iso: string) => new Date(iso);

describe('checkInError', () => {
  it('se abre 30 min antes del paso por la parada', () => {
    expect(
      checkInError(origin, waiting, policy, at('2026-11-02T13:20:00Z')),
    ).toMatch(/en 10 min/);
    expect(
      checkInError(origin, waiting, policy, at('2026-11-02T13:35:00Z')),
    ).toBeNull();
  });
  it('en el origen se cierra al salir; en una parada intermedia, después de la gracia', () => {
    expect(
      checkInError(origin, left, policy, at('2026-11-02T14:06:00Z')),
    ).toMatch(/pasó la parada/);
    expect(
      checkInError(middle, left, policy, at('2026-11-02T16:40:00Z')),
    ).toBeNull();
    expect(
      checkInError(middle, left, policy, at('2026-11-02T16:46:00Z')),
    ).toMatch(/pasó la parada/);
  });
  it('rechaza duplicados, cambiados y recorridos cancelados', () => {
    const now = at('2026-11-02T13:45:00Z');
    expect(
      checkInError(
        { ...origin, status: TicketStatus.checked_in },
        waiting,
        policy,
        now,
      ),
    ).toMatch(/ya abordó/);
    expect(
      checkInError(
        { ...origin, status: TicketStatus.changed },
        waiting,
        policy,
        now,
      ),
    ).toMatch(/boleto nuevo/);
    expect(
      checkInError(
        origin,
        { ...waiting, status: TripStatus.cancelled },
        policy,
        now,
      ),
    ).toMatch(/canceló/);
  });
});

describe('undoError', () => {
  it('solo antes de que el recorrido pase la parada', () => {
    const boarded = { ...origin, status: TicketStatus.checked_in };
    expect(
      undoError(boarded, waiting, policy, at('2026-11-02T13:50:00Z')),
    ).toBeNull();
    expect(
      undoError(boarded, left, policy, at('2026-11-02T14:10:00Z')),
    ).toMatch(/no se puede/);
    expect(
      undoError(origin, waiting, policy, at('2026-11-02T13:50:00Z')),
    ).toMatch(/no ha abordado/);
  });
});

describe('noShows', () => {
  it('al salir marca el origen; las intermedias después de su gracia; al terminar, todo', () => {
    const tickets = [
      origin,
      middle,
      { ...origin, status: TicketStatus.checked_in },
    ];
    expect(noShows(tickets, left, policy, at('2026-11-02T14:10:00Z'))).toEqual([
      origin,
    ]);
    expect(noShows(tickets, left, policy, at('2026-11-02T17:00:00Z'))).toEqual([
      origin,
      middle,
    ]);
    expect(
      noShows(tickets, waiting, policy, at('2026-11-02T17:00:00Z')),
    ).toEqual([]);
    expect(
      noShows(
        tickets,
        { ...left, status: TripStatus.completed },
        policy,
        at('2026-11-02T15:00:00Z'),
      ),
    ).toEqual([origin, middle]);
  });
});
