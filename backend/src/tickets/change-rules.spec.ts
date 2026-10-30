import { describe, expect, it } from 'vitest';
import { PaymentMethod } from '../generated/prisma/enums.js';
import { missingSeats } from '../trips/assignment-rules.js';
import { changeQuote, overrideError, refundError } from './change-rules.js';

describe('refundError', () => {
  it('efectivo sin referencia; tarjeta y transferencia la piden', () => {
    expect(refundError(PaymentMethod.cash, null)).toBeNull();
    expect(refundError(PaymentMethod.card, '')).toMatch(/terminal/);
    expect(refundError(PaymentMethod.transfer, null)).toMatch(/transferencia/);
    expect(refundError(PaymentMethod.card, 'DEV-123')).toBeNull();
    expect(refundError(PaymentMethod.mercadopago, 'x')).toMatch(/taquilla/);
  });
});

describe('overrideError', () => {
  it('entre cero y lo pagado', () => {
    expect(overrideError(0, 500)).toBeNull();
    expect(overrideError(500, 500)).toBeNull();
    expect(overrideError(500.01, 500)).toMatch(/500.00/);
    expect(overrideError(-1, 500)).toMatch(/negativo/);
  });
});

describe('changeQuote', () => {
  it('paga la diferencia más el cargo', () => {
    expect(changeQuote({ newTotal: 820, credit: 560, fee: 50 })).toEqual({
      difference: 260,
      fee: 50,
      due: 310,
      refund: 0,
    });
  });
  it('si le sobra, se le devuelve (descontando el cargo)', () => {
    expect(changeQuote({ newTotal: 410, credit: 820, fee: 50 })).toEqual({
      difference: -410,
      fee: 50,
      due: 0,
      refund: 360,
    });
  });
  it('cambio de asiento sin diferencia ni cargo', () => {
    expect(changeQuote({ newTotal: 560, credit: 560, fee: 0 })).toMatchObject({
      due: 0,
      refund: 0,
    });
  });
});

describe('missingSeats', () => {
  it('lista los asientos vendidos que no tiene la unidad nueva', () => {
    expect(
      missingSeats(['3', '41', '12', '41', '40'], ['1', '2', '3', '12', '40']),
    ).toEqual(['41']);
    expect(missingSeats([], ['1'])).toEqual([]);
  });
});
