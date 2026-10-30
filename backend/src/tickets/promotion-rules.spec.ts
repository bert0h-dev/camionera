import { describe, expect, it } from 'vitest';
import { DiscountType, SaleChannel } from '../generated/prisma/enums.js';
import {
  priceTickets,
  promotionDiscount,
  type PromotionRule,
} from './pricing-rules.js';
import { promotionStatus } from './promotions.service.js';

const row = (over: Record<string, unknown> = {}) =>
  ({
    isActive: true,
    validFrom: new Date('2026-11-13T00:00:00Z'),
    validUntil: new Date('2026-11-16T00:00:00Z'),
    maxUses: null,
    usesCount: 0,
    ...over,
  }) as Parameters<typeof promotionStatus>[0];

describe('promotionStatus', () => {
  it('vigente, por empezar, terminada, agotada e inactiva', () => {
    expect(promotionStatus(row(), '2026-11-14')).toBe('current');
    expect(promotionStatus(row(), '2026-11-12')).toBe('upcoming');
    expect(promotionStatus(row(), '2026-11-17')).toBe('ended');
    expect(
      promotionStatus(row({ maxUses: 5, usesCount: 5 }), '2026-11-14'),
    ).toBe('exhausted');
    expect(promotionStatus(row({ isActive: false }), '2026-11-14')).toBe(
      'inactive',
    );
  });
});

describe('promoción acumulada con el tipo de pasajero (decisión 6.6)', () => {
  const tax = { vatRate: 16, pricesIncludeVat: true, onlinePercent: 0 };
  const promo: PromotionRule = {
    discountType: DiscountType.percent,
    discountValue: 10,
    maxDiscount: null,
    maxUses: null,
    usesCount: 0,
    minPurchase: 0,
    validFrom: '2026-11-01',
    validUntil: '2026-11-30',
    channels: [],
    isActive: true,
  };
  it('el 10 % se aplica sobre lo que queda después del 50 % de INAPAM', () => {
    const inputs = [
      {
        basePrice: 800,
        passengerType: { discountPercent: 50, seasonTypes: [] },
        seasonType: null,
      },
      {
        basePrice: 800,
        passengerType: { discountPercent: 0, seasonTypes: [] },
        seasonType: null,
      },
    ];
    // Importe con descuento de pasajero: 400 + 800 = 1200 → 10 % = 120
    const off = promotionDiscount(promo, 1200);
    expect(off).toBe(120);
    const prices = priceTickets(inputs, tax, SaleChannel.counter, off);
    expect(
      prices.map((p) => [p.passengerDiscount, p.promoDiscount, p.total]),
    ).toEqual([
      [400, 40, 360],
      [0, 80, 720],
    ]);
  });
  it('un monto fijo mayor que la compra deja el total en cero, no negativo', () => {
    const fixed = {
      ...promo,
      discountType: DiscountType.amount,
      discountValue: 5000,
    };
    expect(promotionDiscount(fixed, 1200)).toBe(1200);
  });
});
