import { describe, expect, it } from 'vitest';
import {
  computePayroll,
  dailySalaryCents,
  periodDays,
  splitOvertime,
  totals,
  type PayrollAttendance,
} from './payroll-rules.js';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const rec = (
  date: string,
  status: PayrollAttendance['status'],
  overtimeMinutes = 0,
): PayrollAttendance => ({
  date: d(date),
  status,
  overtimeMinutes,
});

// Semana del lunes 26/10/2026 al domingo 01/11/2026
const WEEK = { periodStart: d('2026-10-26'), periodEnd: d('2026-11-01') };
const NO_PENALTY = { enabled: false, latesPerAbsence: 3 };

describe('salario diario y días', () => {
  it('mensual entre 30, diario tal cual', () => {
    expect(dailySalaryCents('monthly', 15000)).toBe(50000);
    expect(dailySalaryCents('daily', 420.5)).toBe(42050);
  });

  it('cuenta ambos extremos del periodo', () => {
    expect(periodDays(d('2026-10-26'), d('2026-11-01'))).toBe(7);
    expect(periodDays(d('2026-11-01'), d('2026-11-15'))).toBe(15);
  });
});

describe('horas extra por semana', () => {
  it('primeras 9 dobles y el resto triples', () => {
    // 12 h en la misma semana
    const r = splitOvertime([
      rec('2026-10-26', 'present', 360),
      rec('2026-10-27', 'present', 360),
    ]);
    expect(r).toEqual({ double: 9, triple: 3 });
  });

  it('cada semana empieza de cero', () => {
    const r = splitOvertime([
      rec('2026-11-01', 'present', 480),
      rec('2026-11-02', 'present', 480),
    ]);
    expect(r).toEqual({ double: 16, triple: 0 });
  });
});

describe('computePayroll', () => {
  it('paga el periodo completo menos faltas y medio día', () => {
    const r = computePayroll({
      ...WEEK,
      paymentType: 'daily',
      baseSalary: 400,
      records: [
        rec('2026-10-26', 'present'),
        rec('2026-10-27', 'absent'),
        rec('2026-10-28', 'half_day'),
      ],
      latePolicy: NO_PENALTY,
    });
    expect(r.payableDays).toBe(5.5);
    expect(r.salaryAmount).toBe(2200);
  });

  it('extras dobles y triples sobre el valor de la hora (diario / 8)', () => {
    const r = computePayroll({
      ...WEEK,
      paymentType: 'daily',
      baseSalary: 400, // hora = 50
      records: [rec('2026-10-26', 'present', 600)], // 10 h: 9 dobles + 1 triple
      latePolicy: NO_PENALTY,
    });
    expect(r.overtimeAmount).toBe(9 * 100 + 1 * 150);
  });

  it('prima dominical del 25 % por domingo trabajado', () => {
    const r = computePayroll({
      ...WEEK,
      paymentType: 'daily',
      baseSalary: 400,
      records: [rec('2026-11-01', 'late'), rec('2026-10-31', 'present')],
      latePolicy: NO_PENALTY,
    });
    expect(r.sundaysWorked).toBe(1);
    expect(r.sundayPremium).toBe(100);
  });

  it('retardos: informativos o descuento configurable', () => {
    const records = [
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
    ].map((x) => rec(x, 'late'));
    const base = {
      ...WEEK,
      paymentType: 'daily' as const,
      baseSalary: 400,
      records,
    };
    expect(
      computePayroll({ ...base, latePolicy: NO_PENALTY }).lateAbsences,
    ).toBe(0);
    const penalized = computePayroll({
      ...base,
      latePolicy: { enabled: true, latesPerAbsence: 3 },
    });
    expect(penalized.lateAbsences).toBe(1);
    expect(penalized.payableDays).toBe(6);
  });
});

describe('totals', () => {
  it('suma percepciones y resta deducciones con ajustes', () => {
    expect(
      totals(
        { salaryAmount: 2800, overtimeAmount: 150.5, sundayPremium: 100 },
        [
          { type: 'perception', amount: 200 },
          { type: 'deduction', amount: 350.25 },
        ],
      ),
    ).toEqual({
      totalPerceptions: 3250.5,
      totalDeductions: 350.25,
      netPay: 2900.25,
    });
  });
});
