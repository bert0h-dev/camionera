// Precio de un boleto: tramo → temporada → tipo de pasajero → promoción → IVA → cargo en línea.
// Se calcula siempre en el servidor y se congela en el boleto.

import {
  DiscountType,
  SaleChannel,
  SeasonType,
} from '../generated/prisma/enums.js';
import { fromCents, toCents } from './money.js';

export interface PassengerTypeRule {
  discountPercent: number;
  /** Vacío = el descuento aplica siempre */
  seasonTypes: SeasonType[];
}

export interface TaxRules {
  vatRate: number;
  pricesIncludeVat: boolean;
  /** Cargo por servicio en línea (%) */
  onlinePercent: number;
}

export interface TicketPriceInput {
  /** Tarifa del tramo ya con temporada (applySeason) */
  basePrice: number;
  passengerType: PassengerTypeRule;
  /** Tipo de la temporada en la fecha del viaje (null = sin temporada) */
  seasonType: SeasonType | null;
}

export interface TicketPrice {
  basePrice: number;
  passengerDiscount: number;
  promoDiscount: number;
  /** IVA contenido en la tarifa (sin el cargo en línea) */
  vat: number;
  serviceFee: number;
  total: number;
}

export interface PromotionRule {
  discountType: DiscountType;
  discountValue: number;
  maxDiscount: number | null;
  maxUses: number | null;
  usesCount: number;
  minPurchase: number;
  /** 'AAAA-MM-DD' */
  validFrom: string;
  validUntil: string;
  /** Vacío = todos los canales */
  channels: SaleChannel[];
  isActive: boolean;
}

/** El descuento del tipo de pasajero aplica en la temporada del viaje. */
export const passengerDiscountApplies = (
  t: PassengerTypeRule,
  seasonType: SeasonType | null,
) =>
  t.seasonTypes.length === 0 ||
  (seasonType !== null && t.seasonTypes.includes(seasonType));

/** null si la promoción se puede usar; si no, el motivo. */
export function promotionError(
  p: PromotionRule,
  ctx: { amount: number; channel: SaleChannel; today: string },
): string | null {
  if (!p.isActive) return 'La promoción no está activa';
  if (ctx.today < p.validFrom) return 'La promoción aún no empieza';
  if (ctx.today > p.validUntil) return 'La promoción ya terminó';
  if (p.maxUses != null && p.usesCount >= p.maxUses)
    return 'La promoción ya se agotó';
  if (p.channels.length > 0 && !p.channels.includes(ctx.channel))
    return ctx.channel === SaleChannel.online
      ? 'La promoción no aplica en línea'
      : 'La promoción no aplica en taquilla';
  if (ctx.amount < p.minPurchase)
    return `La compra mínima para esta promoción es de $${p.minPurchase.toFixed(2)}`;
  return null;
}

/** Descuento total de la promoción sobre el importe de la compra (nunca más que el importe). */
export function promotionDiscount(p: PromotionRule, amount: number) {
  const cents = toCents(amount);
  let off =
    p.discountType === DiscountType.percent
      ? Math.round((cents * p.discountValue) / 100)
      : toCents(p.discountValue);
  if (p.discountType === DiscountType.percent && p.maxDiscount != null)
    off = Math.min(off, toCents(p.maxDiscount));
  return fromCents(Math.min(off, cents));
}

/** Reparte un monto en proporción a los pesos; el residuo de centavos va al último. */
export function distribute(amount: number, weights: number[]) {
  const total = toCents(amount);
  const cents = weights.map(toCents);
  const sum = cents.reduce((a, w) => a + w, 0);
  if (sum === 0) return weights.map(() => 0);
  let assigned = 0;
  return cents.map((w, i) => {
    const share =
      i === cents.length - 1 ? total - assigned : Math.floor((total * w) / sum);
    assigned += share;
    return fromCents(share);
  });
}

/**
 * Precios de los boletos de una compra. `promoDiscount` es el descuento total de la
 * promoción (promotionDiscount sobre el importe ya con el descuento de pasajero).
 */
export function priceTickets(
  inputs: TicketPriceInput[],
  tax: TaxRules,
  channel: SaleChannel,
  promoDiscount = 0,
): TicketPrice[] {
  const afterType = inputs.map((t) => {
    const base = toCents(t.basePrice);
    const off = passengerDiscountApplies(t.passengerType, t.seasonType)
      ? Math.round((base * t.passengerType.discountPercent) / 100)
      : 0;
    return { base, off, net: base - off };
  });
  const promos = distribute(
    promoDiscount,
    afterType.map((t) => fromCents(t.net)),
  ).map(toCents);
  const rate = tax.vatRate / 100;

  return afterType.map(({ base, off, net }, i) => {
    const promo = Math.min(promos[i], net);
    const amount = net - promo;
    const vat = tax.pricesIncludeVat
      ? amount - Math.round(amount / (1 + rate))
      : Math.round(amount * rate);
    const fare = tax.pricesIncludeVat ? amount : amount + vat;
    const fee =
      channel === SaleChannel.online
        ? Math.round((fare * tax.onlinePercent) / 100)
        : 0;
    return {
      basePrice: fromCents(base),
      passengerDiscount: fromCents(off),
      promoDiscount: fromCents(promo),
      vat: fromCents(vat),
      serviceFee: fromCents(fee),
      total: fromCents(fare + fee),
    };
  });
}

/** Totales de la compra a partir de sus boletos (`discount` junta pasajero y promoción). */
export function orderTotals(prices: TicketPrice[]) {
  const sum = (pick: (p: TicketPrice) => number) =>
    fromCents(prices.reduce((a, p) => a + toCents(pick(p)), 0));
  return {
    subtotal: sum((p) => p.basePrice),
    discount: sum((p) => p.passengerDiscount + p.promoDiscount),
    vat: sum((p) => p.vat),
    serviceFee: sum((p) => p.serviceFee),
    total: sum((p) => p.total),
  };
}
