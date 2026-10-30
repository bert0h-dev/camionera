import { describe, expect, it } from 'vitest';
import {
  DiscountType,
  SaleChannel,
  SeasonType,
  TicketStatus,
} from '../generated/prisma/enums.js';
import {
  freeSeats,
  overlaps,
  quotaLeft,
  seatStates,
  segmentError,
  type TicketOccupancy,
} from './availability-rules.js';
import { cancellationQuote } from './cancellation-rules.js';
import {
  distribute,
  orderTotals,
  priceTickets,
  promotionDiscount,
  promotionError,
  type PromotionRule,
} from './pricing-rules.js';
import { canTransition } from './ticket-status-rules.js';

const now = new Date('2026-11-02T12:00:00Z');
const ticket = (over: Partial<TicketOccupancy> = {}): TicketOccupancy => ({
  seatNumber: '1',
  boardIndex: 0,
  alightIndex: 3,
  status: TicketStatus.confirmed,
  ...over,
});
const seats = ['1', '2', '3'].map((number) => ({ number, isBlocked: false }));

describe('overlaps', () => {
  it('tramos contiguos no se enciman', () => {
    expect(overlaps({ board: 0, alight: 1 }, { board: 1, alight: 2 })).toBe(
      false,
    );
  });
  it('tramos que comparten un trecho se enciman', () => {
    expect(overlaps({ board: 0, alight: 2 }, { board: 1, alight: 3 })).toBe(
      true,
    );
  });
});

describe('segmentError', () => {
  it('acepta un tramo dentro del itinerario', () => {
    expect(segmentError({ board: 1, alight: 3 }, 4)).toBeNull();
  });
  it('rechaza bajada antes de la subida o fuera de la ruta', () => {
    expect(segmentError({ board: 2, alight: 2 }, 4)).toMatch(/posterior/);
    expect(segmentError({ board: 0, alight: 4 }, 4)).toMatch(/ruta/);
  });
});

describe('seatStates', () => {
  it('el asiento se reutiliza en un tramo que no se encima', () => {
    const tickets = [ticket({ boardIndex: 0, alightIndex: 1 })];
    expect(freeSeats(seats, tickets, { board: 1, alight: 3 }, now)).toContain(
      '1',
    );
    expect(
      freeSeats(seats, tickets, { board: 0, alight: 2 }, now),
    ).not.toContain('1');
  });
  it('distingue apartado, ocupado y bloqueado', () => {
    const states = seatStates(
      [...seats, { number: '4', isBlocked: true }],
      [
        ticket(),
        ticket({
          seatNumber: '2',
          status: TicketStatus.held,
          expiresAt: new Date(now.getTime() + 60_000),
        }),
      ],
      { board: 0, alight: 3 },
      now,
    );
    expect(Object.fromEntries(states)).toEqual({
      '1': 'occupied',
      '2': 'held',
      '3': 'free',
      '4': 'blocked',
    });
  });
  it('un apartado vencido o un cancelado ya no ocupa', () => {
    const tickets = [
      ticket({ status: TicketStatus.held, expiresAt: now }),
      ticket({ seatNumber: '2', status: TicketStatus.cancelled }),
    ];
    expect(freeSeats(seats, tickets, { board: 0, alight: 3 }, now)).toEqual([
      '1',
      '2',
      '3',
    ]);
  });
});

describe('quotaLeft', () => {
  it('cuenta solo los del tipo que se enciman con el tramo', () => {
    const same = [
      ticket(),
      ticket({ seatNumber: '2', boardIndex: 2, alightIndex: 3 }),
    ];
    expect(quotaLeft(2, same, { board: 0, alight: 1 }, now)).toBe(1);
    expect(quotaLeft(2, same, { board: 2, alight: 3 }, now)).toBe(0);
    expect(quotaLeft(null, same, { board: 0, alight: 3 }, now)).toBeNull();
  });
});

const adult = { discountPercent: 0, seasonTypes: [] };
const student = {
  discountPercent: 50,
  seasonTypes: [SeasonType.high, SeasonType.holiday],
};
const included = { vatRate: 16, pricesIncludeVat: true, onlinePercent: 5 };

describe('priceTickets', () => {
  it('desglosa el IVA incluido en taquilla', () => {
    const [p] = priceTickets(
      [{ basePrice: 580, passengerType: adult, seasonType: null }],
      included,
      SaleChannel.counter,
    );
    expect(p).toEqual({
      basePrice: 580,
      passengerDiscount: 0,
      promoDiscount: 0,
      vat: 80,
      serviceFee: 0,
      total: 580,
    });
  });
  it('suma el IVA cuando la tarifa no lo incluye y agrega el cargo en línea', () => {
    const [p] = priceTickets(
      [{ basePrice: 500, passengerType: adult, seasonType: null }],
      { ...included, pricesIncludeVat: false },
      SaleChannel.online,
    );
    expect(p.vat).toBe(80);
    expect(p.serviceFee).toBe(29);
    expect(p.total).toBe(609);
  });
  it('el descuento de estudiante solo aplica en su temporada', () => {
    const run = (seasonType: SeasonType | null) =>
      priceTickets(
        [{ basePrice: 400, passengerType: student, seasonType }],
        included,
        SaleChannel.counter,
      )[0].total;
    expect(run(SeasonType.high)).toBe(200);
    expect(run(SeasonType.low)).toBe(400);
    expect(run(null)).toBe(400);
  });
  it('reparte la promoción y los totales cuadran', () => {
    const prices = priceTickets(
      [
        { basePrice: 300, passengerType: adult, seasonType: null },
        { basePrice: 300, passengerType: student, seasonType: SeasonType.high },
      ],
      included,
      SaleChannel.counter,
      45,
    );
    expect(prices.map((p) => p.promoDiscount)).toEqual([30, 15]);
    expect(orderTotals(prices)).toEqual({
      subtotal: 600,
      discount: 195,
      vat: 55.86,
      serviceFee: 0,
      total: 405,
    });
  });
});

describe('distribute', () => {
  it('el residuo de centavos va al último', () => {
    expect(distribute(10, [1, 1, 1])).toEqual([3.33, 3.33, 3.34]);
    expect(distribute(10, [0, 0])).toEqual([0, 0]);
  });
});

const promo = (over: Partial<PromotionRule> = {}): PromotionRule => ({
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
  ...over,
});
const ctx = { amount: 1000, channel: SaleChannel.counter, today: '2026-11-02' };

describe('promociones', () => {
  it('valida vigencia, usos, canal y compra mínima', () => {
    expect(promotionError(promo(), ctx)).toBeNull();
    expect(promotionError(promo({ validUntil: '2026-11-01' }), ctx)).toMatch(
      /terminó/,
    );
    expect(promotionError(promo({ maxUses: 5, usesCount: 5 }), ctx)).toMatch(
      /agotó/,
    );
    expect(
      promotionError(promo({ channels: [SaleChannel.online] }), ctx),
    ).toMatch(/taquilla/);
    expect(promotionError(promo({ minPurchase: 1500 }), ctx)).toMatch(
      /mínima/,
    );
  });
  it('respeta el tope y no pasa del importe', () => {
    expect(promotionDiscount(promo({ maxDiscount: 50 }), 1000)).toBe(50);
    expect(
      promotionDiscount(
        promo({ discountType: DiscountType.amount, discountValue: 200 }),
        150,
      ),
    ).toBe(150);
  });
});

describe('cancellationQuote', () => {
  const policy = { cancellationHours: 2, refundPercent: 80 };
  const boardAt = new Date('2026-11-02T15:00:00Z');
  it('dentro del plazo devuelve el porcentaje sin el cargo en línea', () => {
    const q = cancellationQuote(
      { total: 525, serviceFee: 25, boardAt, now },
      policy,
    );
    expect(q).toEqual({
      inWindow: true,
      deadline: new Date('2026-11-02T13:00:00Z'),
      refund: 400,
    });
  });
  it('fuera del plazo no hay reembolso', () => {
    const late = new Date('2026-11-02T13:30:00Z');
    expect(
      cancellationQuote({ total: 500, serviceFee: 0, boardAt, now: late }, policy)
        .refund,
    ).toBe(0);
  });
  it('si la empresa cancela el recorrido se devuelve todo', () => {
    const late = new Date('2026-11-02T14:59:00Z');
    expect(
      cancellationQuote(
        { total: 525, serviceFee: 25, boardAt, now: late, tripCancelled: true },
        policy,
      ).refund,
    ).toBe(525);
  });
});

describe('estados del boleto', () => {
  it('solo un confirmado aborda; los finales no cambian', () => {
    expect(canTransition(TicketStatus.confirmed, TicketStatus.checked_in)).toBe(
      true,
    );
    expect(canTransition(TicketStatus.held, TicketStatus.checked_in)).toBe(
      false,
    );
    expect(canTransition(TicketStatus.checked_in, TicketStatus.cancelled)).toBe(
      false,
    );
  });
});
