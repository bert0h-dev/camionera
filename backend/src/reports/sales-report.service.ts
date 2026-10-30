import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import {
  addDays,
  businessTimezone,
  dateKey,
  toDate,
  zonedDateTime,
} from '../common/dates.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  PaymentStatus,
  TicketStatus,
  UserRole,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { fromCents, toCents } from '../tickets/money.js';
import { SalesReportDto } from './dto/report.dto.js';
import {
  change,
  dayIn,
  daysOf,
  previousRange,
  rangeError,
  sumBy,
} from './report-rules.js';

const n = (d: Prisma.Decimal | number | null | undefined) => Number(d ?? 0);

/** Instantes [desde, hasta) de un periodo de días de la central. */
export function instantsOf(from: string, to: string) {
  return {
    gte: zonedDateTime(from, '00:00'),
    lt: zonedDateTime(dateKey(addDays(toDate(to), 1)), '00:00'),
  };
}

/**
 * Reporte de ventas. Dinero que entra: pagos por fecha de cobro; dinero que sale: reembolsos en
 * su propia fecha (así cuadra con los cortes de caja). Boletos: los de compras cobradas en el
 * periodo, sin contar los cambiados (cuenta el boleto que los reemplazó).
 */
@Injectable()
export class SalesReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** El vendedor solo ve sus ventas. */
  private scope(q: SalesReportDto, user: AuthUser) {
    return user.role === UserRole.vendor ? { ...q, sellerId: user.id } : q;
  }

  private async totals(q: SalesReportDto, from: string, to: string) {
    const when = instantsOf(from, to);
    const orderWhere: Prisma.OrderWhereInput = {
      sellerId: q.sellerId,
      channel: q.channel,
      ...(q.routeId
        ? { tickets: { some: { trip: { routeId: q.routeId } } } }
        : {}),
    };
    const [payments, refunds, tickets] = await Promise.all([
      this.prisma.payment.aggregate({
        where: {
          status: PaymentStatus.approved,
          paidAt: when,
          order: orderWhere,
        },
        _sum: { amount: true },
      }),
      this.prisma.refund.aggregate({
        where: { createdAt: when, order: orderWhere },
        _sum: { amount: true },
      }),
      this.prisma.ticket.count({
        where: {
          order: { ...orderWhere, paidAt: when },
          status: { notIn: [TicketStatus.held, TicketStatus.changed] },
          ...(q.routeId ? { trip: { routeId: q.routeId } } : {}),
        },
      }),
    ]);
    const gross = n(payments._sum.amount);
    const refunded = n(refunds._sum.amount);
    return {
      gross,
      refunds: refunded,
      net: fromCents(toCents(gross) - toCents(refunded)),
      tickets,
    };
  }

  async sales(input: SalesReportDto, user: AuthUser) {
    const q = this.scope(input, user);
    const err = rangeError(q.from, q.to);
    if (err) throw new BadRequestException(err);
    const tz = businessTimezone();
    const when = instantsOf(q.from, q.to);
    const orderWhere: Prisma.OrderWhereInput = {
      sellerId: q.sellerId,
      channel: q.channel,
      ...(q.routeId
        ? { tickets: { some: { trip: { routeId: q.routeId } } } }
        : {}),
    };

    const [payments, refunds, tickets, promos, vendorPercent] =
      await Promise.all([
        this.prisma.payment.findMany({
          where: {
            status: PaymentStatus.approved,
            paidAt: when,
            order: orderWhere,
          },
          select: {
            amount: true,
            method: true,
            paidAt: true,
            orderId: true,
            order: {
              select: {
                channel: true,
                sellerId: true,
                seller: { select: { fullName: true } },
              },
            },
          },
        }),
        this.prisma.refund.findMany({
          where: { createdAt: when, order: orderWhere },
          select: {
            amount: true,
            method: true,
            createdAt: true,
            createdById: true,
            createdBy: { select: { fullName: true } },
            order: { select: { channel: true } },
          },
        }),
        this.prisma.ticket.findMany({
          where: {
            order: { ...orderWhere, paidAt: when },
            status: { notIn: [TicketStatus.held, TicketStatus.changed] },
            ...(q.routeId ? { trip: { routeId: q.routeId } } : {}),
          },
          select: {
            total: true,
            vat: true,
            basePrice: true,
            passengerDiscount: true,
            promoDiscount: true,
            status: true,
            order: { select: { paidAt: true } },
            passengerType: { select: { name: true } },
            trip: {
              select: {
                route: { select: { id: true, code: true, name: true } },
              },
            },
            boardTerminal: { select: { city: { select: { name: true } } } },
            alightTerminal: { select: { city: { select: { name: true } } } },
          },
        }),
        this.prisma.orderPromotion.findMany({
          where: { order: { ...orderWhere, paidAt: when } },
          select: {
            discountApplied: true,
            promotion: { select: { code: true, name: true } },
          },
        }),
        this.settings.get('commissions.vendor_percent'),
      ]);

    const gross = payments.reduce((a, p) => a + toCents(n(p.amount)), 0);
    const refunded = refunds.reduce((a, r) => a + toCents(n(r.amount)), 0);
    const fare = tickets.reduce((a, t) => a + toCents(n(t.total)), 0);
    const orders = new Set(payments.map((p) => p.orderId)).size;
    const prev = previousRange(q.from, q.to);
    const before = await this.totals(q, prev.from, prev.to);
    const summary = {
      gross: fromCents(gross),
      refunds: fromCents(refunded),
      net: fromCents(gross - refunded),
      orders,
      tickets: tickets.length,
      avgTicket: tickets.length
        ? fromCents(Math.round(fare / tickets.length))
        : 0,
      vat: fromCents(tickets.reduce((a, t) => a + toCents(n(t.vat)), 0)),
      passengerDiscounts: fromCents(
        tickets.reduce((a, t) => a + toCents(n(t.passengerDiscount)), 0),
      ),
      promoDiscounts: fromCents(
        tickets.reduce((a, t) => a + toCents(n(t.promoDiscount)), 0),
      ),
      previous: { ...prev, ...before },
      change: {
        gross: change(fromCents(gross), before.gross),
        net: change(fromCents(gross - refunded), before.net),
        tickets: change(tickets.length, before.tickets),
      },
    };

    // Por día (los días sin datos van en cero)
    const days = sumBy<'gross' | 'refunds' | 'tickets'>([
      ...daysOf(q.from, q.to).map(
        (d) =>
          [d, { gross: 0, refunds: 0, tickets: 0 }] as [
            string,
            Record<'gross' | 'refunds' | 'tickets', number>,
          ],
      ),
      ...payments.map(
        (p) =>
          [
            dayIn(p.paidAt!, tz),
            { gross: n(p.amount), refunds: 0, tickets: 0 },
          ] as [string, Record<'gross' | 'refunds' | 'tickets', number>],
      ),
      ...refunds.map(
        (r) =>
          [
            dayIn(r.createdAt, tz),
            { gross: 0, refunds: n(r.amount), tickets: 0 },
          ] as [string, Record<'gross' | 'refunds' | 'tickets', number>],
      ),
      ...tickets.map(
        (t) =>
          [
            dayIn(t.order.paidAt!, tz),
            { gross: 0, refunds: 0, tickets: 1 },
          ] as [string, Record<'gross' | 'refunds' | 'tickets', number>],
      ),
    ])
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((d) => ({
        date: d.key,
        gross: d.gross,
        refunds: d.refunds,
        net: fromCents(toCents(d.gross) - toCents(d.refunds)),
        tickets: d.tickets,
      }));

    const byMethod = sumBy<'sales' | 'refunds'>(
      [
        ...payments.map(
          (p) =>
            [p.method, { sales: n(p.amount), refunds: 0 }] as [
              string,
              Record<'sales' | 'refunds', number>,
            ],
        ),
        ...refunds.map(
          (r) =>
            [r.method, { sales: 0, refunds: n(r.amount) }] as [
              string,
              Record<'sales' | 'refunds', number>,
            ],
        ),
      ],
      'sales',
    ).map((m) => ({
      method: m.key,
      sales: m.sales,
      refunds: m.refunds,
      net: fromCents(toCents(m.sales) - toCents(m.refunds)),
    }));

    const byChannel = sumBy<'gross'>(
      payments.map((p) => [p.order.channel, { gross: n(p.amount) }]),
      'gross',
    ).map((c) => ({ channel: c.key, gross: c.gross }));

    // Por vendedor: ventas por quien vendió; reembolsos por quien los hizo (como en la caja)
    const sellerNames = new Map<string, string>();
    for (const p of payments)
      if (p.order.sellerId)
        sellerNames.set(p.order.sellerId, p.order.seller?.fullName ?? '—');
    for (const r of refunds)
      if (r.createdById)
        sellerNames.set(r.createdById, r.createdBy?.fullName ?? '—');
    const bySeller = sumBy<'gross' | 'refunds' | 'orders'>(
      [
        ...payments.map(
          (p) =>
            [
              p.order.sellerId ?? 'online',
              { gross: n(p.amount), refunds: 0, orders: 0 },
            ] as [string, Record<'gross' | 'refunds' | 'orders', number>],
        ),
        ...refunds.map(
          (r) =>
            [
              r.createdById ?? 'online',
              { gross: 0, refunds: n(r.amount), orders: 0 },
            ] as [string, Record<'gross' | 'refunds' | 'orders', number>],
        ),
        ...[...new Map(payments.map((p) => [p.orderId, p])).values()].map(
          (p) =>
            [
              p.order.sellerId ?? 'online',
              { gross: 0, refunds: 0, orders: 1 },
            ] as [string, Record<'gross' | 'refunds' | 'orders', number>],
        ),
      ],
      'gross',
    ).map((s) => {
      const net = fromCents(toCents(s.gross) - toCents(s.refunds));
      return {
        sellerId: s.key === 'online' ? null : s.key,
        name: s.key === 'online' ? 'En línea' : (sellerNames.get(s.key) ?? '—'),
        gross: s.gross,
        refunds: s.refunds,
        net,
        orders: s.orders,
        // Estimada con el % vigente; la comisión congelada de cada corte está en Caja
        commission:
          s.key === 'online'
            ? 0
            : fromCents(
                Math.max(0, Math.round((toCents(net) * vendorPercent) / 100)),
              ),
      };
    });

    const byRoute = sumBy<'tickets' | 'revenue'>(
      tickets.map((t) => [
        t.trip.route.id,
        { tickets: 1, revenue: n(t.total) },
      ]),
      'revenue',
    ).map((r) => {
      const route = tickets.find((t) => t.trip.route.id === r.key)!.trip.route;
      return {
        routeId: r.key,
        code: route.code,
        name: route.name,
        tickets: r.tickets,
        revenue: r.revenue,
        share: fare ? Math.round((toCents(r.revenue) / fare) * 1000) / 10 : 0,
      };
    });

    const byLeg = sumBy<'tickets' | 'revenue'>(
      tickets.map((t) => [
        `${t.boardTerminal.city.name} → ${t.alightTerminal.city.name}`,
        { tickets: 1, revenue: n(t.total) },
      ]),
      'tickets',
    )
      .slice(0, 20)
      .map((l) => ({ leg: l.key, tickets: l.tickets, revenue: l.revenue }));

    const byPassengerType = sumBy<'tickets' | 'discount' | 'revenue'>(
      tickets.map((t) => [
        t.passengerType.name,
        { tickets: 1, discount: n(t.passengerDiscount), revenue: n(t.total) },
      ]),
      'tickets',
    ).map((p) => ({
      type: p.key,
      tickets: p.tickets,
      discount: p.discount,
      revenue: p.revenue,
    }));

    const byPromotion = sumBy<'orders' | 'discount'>(
      promos.map((p) => [
        `${p.promotion.code}|${p.promotion.name}`,
        { orders: 1, discount: n(p.discountApplied) },
      ]),
      'discount',
    ).map((p) => {
      const [code, name] = p.key.split('|');
      return { code, name, orders: p.orders, discount: p.discount };
    });

    return {
      range: { from: q.from, to: q.to, timezone: tz },
      filters: {
        routeId: q.routeId ?? null,
        sellerId: q.sellerId ?? null,
        channel: q.channel ?? null,
      },
      vendorPercent,
      summary,
      days,
      byMethod,
      byChannel,
      bySeller,
      byRoute,
      byLeg,
      byPassengerType,
      byPromotion,
    };
  }
}
