import { describe, expect, it } from 'vitest';
import { CashMovementType, PaymentMethod } from '../generated/prisma/enums.js';
import {
  cashTotals,
  closeCheck,
  commission,
  countBreakdown,
  withdrawalError,
} from './cash-rules.js';

const { sale, refund, withdrawal, deposit } = CashMovementType;
const { cash, card, transfer } = PaymentMethod;

describe('cashTotals', () => {
  it('el esperado solo cuenta el efectivo', () => {
    const t = cashTotals(500, [
      { type: sale, method: cash, amount: 860 },
      { type: sale, method: card, amount: 420.5 },
      { type: sale, method: transfer, amount: 300 },
      { type: refund, method: cash, amount: 100 },
      { type: withdrawal, method: cash, amount: 1000 },
      { type: deposit, method: cash, amount: 200 },
    ]);
    expect(t.expectedCash).toBe(460);
    expect(t.sales).toMatchObject({ cash: 860, card: 420.5, transfer: 300 });
    expect(t.netSales).toBe(1480.5);
  });
});

describe('countBreakdown', () => {
  it('suma billetes y monedas', () => {
    expect(countBreakdown({ '500': 2, '20': 3, '0.5': 3 })).toEqual({
      ok: true,
      total: 1061.5,
    });
  });
  it('rechaza denominaciones o cantidades inválidas', () => {
    expect(countBreakdown({ '300': 1 })).toMatchObject({ ok: false });
    expect(countBreakdown({ '100': -1 })).toMatchObject({ ok: false });
    expect(countBreakdown({ '100': 1.5 })).toMatchObject({ ok: false });
  });
});

describe('closeCheck', () => {
  it('cuadra sin motivo', () => {
    expect(closeCheck(460, 460, 0, null)).toEqual({
      difference: 0,
      error: null,
    });
  });
  it('fuera de tolerancia pide motivo', () => {
    expect(closeCheck(460, 450, 0, '').error).toMatch(/-10.00/);
    expect(closeCheck(460, 450, 0, 'Faltó cambio').error).toBeNull();
    expect(closeCheck(460, 465, 5, null)).toEqual({
      difference: 5,
      error: null,
    });
  });
});

describe('comisión y retiros', () => {
  it('comisión sobre lo neto, nunca negativa', () => {
    expect(commission(1480.5, 2.5)).toBe(37.01);
    expect(commission(-50, 2.5)).toBe(0);
  });
  it('no se retira más efectivo del que hay', () => {
    expect(withdrawalError(460, 500)).toMatch(/460.00/);
    expect(withdrawalError(460, 460)).toBeNull();
  });
});
