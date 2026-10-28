import { describe, expect, it } from 'vitest';
import { nextService, orderFolio } from './maintenance-rules.js';

const today = new Date('2026-10-27');
const base = { date: new Date('2026-09-01'), km: 100_000 };
const plan = { km: 15_000, days: 90 };

describe('nextService', () => {
  it('al día cuando faltan muchos km y días', () => {
    const r = nextService(plan, base, 105_000, today, 7, 1000);
    expect(r.status).toBe('ok');
    expect(r.dueKm).toBe(115_000);
    expect(r.kmLeft).toBe(10_000);
    expect(r.daysLeft).toBe(34);
  });

  it('próximo por km aunque falten días', () => {
    const r = nextService(plan, base, 114_200, today, 7, 1000);
    expect(r.status).toBe('due_soon');
    expect(r.trigger).toBe('km');
  });

  it('próximo por días aunque falten km', () => {
    const r = nextService(
      plan,
      { date: new Date('2026-08-01'), km: 100_000 },
      101_000,
      today,
      7,
      1000,
    );
    expect(r.daysLeft).toBe(3);
    expect(r.status).toBe('due_soon');
    expect(r.trigger).toBe('days');
  });

  it('vencido por lo que ocurra primero', () => {
    expect(nextService(plan, base, 115_001, today, 7, 1000).status).toBe(
      'overdue',
    );
    expect(
      nextService(
        plan,
        { date: new Date('2026-07-01'), km: 100_000 },
        100_500,
        today,
        7,
        1000,
      ).status,
    ).toBe('overdue');
  });

  it('funciona con un solo criterio y sin plan', () => {
    expect(
      nextService({ km: null, days: 30 }, base, 0, today, 7, 1000).status,
    ).toBe('overdue');
    expect(
      nextService({ km: 5000, days: null }, base, 101_000, today, 7, 1000)
        .kmLeft,
    ).toBe(4000);
    expect(
      nextService({ km: null, days: null }, base, 0, today, 7, 1000).status,
    ).toBe('no_plan');
  });
});

describe('orderFolio', () => {
  it('rellena con ceros', () => expect(orderFolio(123)).toBe('OT-000123'));
});
