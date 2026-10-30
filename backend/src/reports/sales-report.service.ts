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
import { UserRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { fromCents, toCents } from '../tickets/money.js';
import { SalesReportDto } from './dto/report.dto.js';
import {
  change,
  daysOf,
  previousRange,
  rangeError,
  sumBy,
} from './report-rules.js';

/** Instantes [desde, hasta) de un periodo de días de la central. */
export function instantsOf(from: string, to: string) {
  return {
    gte: zonedDateTime(from, '00:00'),
    lt: zonedDateTime(dateKey(addDays(toDate(to), 1)), '00:00'),
  };
}

const num = (v: unknown) => Number(v ?? 0);

/** Boletos que cuentan como vendidos: sin apartados ni cambiados (cuenta el que los reemplazó). */
const SOLD = Prisma.sql`t.status NOT IN ('held', 'changed')`;

/**
 * Reporte de ventas. Dinero que entra: pagos por fecha de cobro; dinero que sale: reembolsos en
 * su propia fecha (así cuadra con los cortes de caja). Las sumas se hacen en SQL agrupadas por
 * día de la central, para que un mes con decenas de miles de boletos responda en menos de un segundo.
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

  /** Condición sobre la compra `o` según los filtros (vendedor, canal, ruta). */
  private orderCond(q: SalesReportDto) {
    const parts = [Prisma.sql`TRUE`];
    if (q.sellerId) parts.push(Prisma.sql`o.seller_id = ${q.sellerId}::uuid`);
    if (q.channel)
      parts.push(Prisma.sql`o.channel = ${q.channel}::"SaleChannel"`);
    if (q.routeId)
      parts.push(
        Prisma.sql`EXISTS (SELECT 1 FROM tickets rt JOIN trips rtr ON rtr.id = rt.trip_id WHERE rt.order_id = o.id AND rtr.route_id = ${q.routeId}::uuid)`,
      );
    return Prisma.join(parts, ' AND ');
  }

  private routeCond(q: SalesReportDto) {
    return q.routeId
      ? Prisma.sql`tr.route_id = ${q.routeId}::uuid`
      : Prisma.sql`TRUE`;
  }

  private async totals(q: SalesReportDto, from: string, to: string) {
    const { gte, lt } = instantsOf(from, to);
    const cond = this.orderCond(q);
    const [[pay], [ref], [tix]] = await Promise.all([
      this.prisma.$queryRaw<{ s: unknown }[]>`
        SELECT SUM(p.amount) s FROM payments p JOIN orders o ON o.id = p.order_id
        WHERE p.status = 'approved' AND p.paid_at >= ${gte} AND p.paid_at < ${lt} AND ${cond}`,
      this.prisma.$queryRaw<{ s: unknown }[]>`
        SELECT SUM(r.amount) s FROM refunds r JOIN orders o ON o.id = r.order_id
        WHERE r.created_at >= ${gte} AND r.created_at < ${lt} AND ${cond}`,
      this.prisma.$queryRaw<{ n: unknown }[]>`
        SELECT COUNT(*) n FROM tickets t JOIN orders o ON o.id = t.order_id JOIN trips tr ON tr.id = t.trip_id
        WHERE o.paid_at >= ${gte} AND o.paid_at < ${lt} AND ${SOLD} AND ${cond} AND ${this.routeCond(q)}`,
    ]);
    const gross = num(pay.s);
    const refunds = num(ref.s);
    return {
      gross,
      refunds,
      net: fromCents(toCents(gross) - toCents(refunds)),
      tickets: num(tix.n),
    };
  }

  async sales(input: SalesReportDto, user: AuthUser) {
    const q = this.scope(input, user);
    const err = rangeError(q.from, q.to);
    if (err) throw new BadRequestException(err);
    const tz = businessTimezone();
    const { gte, lt } = instantsOf(q.from, q.to);
    const cond = this.orderCond(q);
    const routeCond = this.routeCond(q);
    const ticketsFrom = Prisma.sql`
      FROM tickets t JOIN orders o ON o.id = t.order_id JOIN trips tr ON tr.id = t.trip_id
      WHERE o.paid_at >= ${gte} AND o.paid_at < ${lt} AND ${SOLD} AND ${cond} AND ${routeCond}`;

    type PayRow = {
      day: string;
      method: string;
      channel: string;
      seller: string | null;
      s: unknown;
    };
    type RefRow = {
      day: string;
      method: string;
      by: string | null;
      s: unknown;
    };
    const [
      payRows,
      refRows,
      orderRows,
      sellerNames,
      ticketDays,
      ticketTotals,
      routeRows,
      legRows,
      typeRows,
      promoRows,
      vendorPercent,
    ] = await Promise.all([
      this.prisma.$queryRaw<PayRow[]>`
          SELECT to_char(p.paid_at AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day, p.method::text AS method,
                 o.channel::text AS channel, o.seller_id::text AS seller, SUM(p.amount) s
          FROM payments p JOIN orders o ON o.id = p.order_id
          WHERE p.status = 'approved' AND p.paid_at >= ${gte} AND p.paid_at < ${lt} AND ${cond}
          GROUP BY 1, 2, 3, 4`,
      this.prisma.$queryRaw<RefRow[]>`
          SELECT to_char(r.created_at AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day, r.method::text AS method,
                 r.created_by::text AS by, SUM(r.amount) s
          FROM refunds r JOIN orders o ON o.id = r.order_id
          WHERE r.created_at >= ${gte} AND r.created_at < ${lt} AND ${cond}
          GROUP BY 1, 2, 3`,
      // Compras distintas por vendedor (una compra con pago mixto cuenta una vez)
      this.prisma.$queryRaw<{ seller: string | null; n: unknown }[]>`
          SELECT o.seller_id::text AS seller, COUNT(DISTINCT p.order_id) n
          FROM payments p JOIN orders o ON o.id = p.order_id
          WHERE p.status = 'approved' AND p.paid_at >= ${gte} AND p.paid_at < ${lt} AND ${cond}
          GROUP BY 1`,
      this.prisma.user.findMany({ select: { id: true, fullName: true } }),
      this.prisma.$queryRaw<{ day: string; n: unknown }[]>`
          SELECT to_char(o.paid_at AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day, COUNT(*) n ${ticketsFrom} GROUP BY 1`,
      this.prisma.$queryRaw<
        { n: unknown; fare: unknown; vat: unknown; pd: unknown; pr: unknown }[]
      >`
          SELECT COUNT(*) n, SUM(t.total) fare, SUM(t.vat) vat, SUM(t.passenger_discount) pd, SUM(t.promo_discount) pr
          ${ticketsFrom}`,
      this.prisma.$queryRaw<
        { id: string; code: string; name: string; n: unknown; s: unknown }[]
      >`
          SELECT r.id::text AS id, r.code, r.name, COUNT(*) n, SUM(t.total) s
          FROM tickets t JOIN orders o ON o.id = t.order_id JOIN trips tr ON tr.id = t.trip_id JOIN routes r ON r.id = tr.route_id
          WHERE o.paid_at >= ${gte} AND o.paid_at < ${lt} AND ${SOLD} AND ${cond} AND ${routeCond}
          GROUP BY 1, 2, 3 ORDER BY s DESC`,
      this.prisma.$queryRaw<{ leg: string; n: unknown; s: unknown }[]>`
          SELECT bc.name || ' → ' || ac.name AS leg, COUNT(*) n, SUM(t.total) s
          FROM tickets t JOIN orders o ON o.id = t.order_id JOIN trips tr ON tr.id = t.trip_id
          JOIN terminals bt ON bt.id = t.board_terminal_id JOIN cities bc ON bc.id = bt.city_id
          JOIN terminals at ON at.id = t.alight_terminal_id JOIN cities ac ON ac.id = at.city_id
          WHERE o.paid_at >= ${gte} AND o.paid_at < ${lt} AND ${SOLD} AND ${cond} AND ${routeCond}
          GROUP BY 1 ORDER BY n DESC, s DESC LIMIT 20`,
      this.prisma.$queryRaw<
        { type: string; n: unknown; d: unknown; s: unknown }[]
      >`
          SELECT pt.name AS type, COUNT(*) n, SUM(t.passenger_discount) d, SUM(t.total) s
          FROM tickets t JOIN orders o ON o.id = t.order_id JOIN trips tr ON tr.id = t.trip_id
          JOIN passenger_types pt ON pt.id = t.passenger_type_id
          WHERE o.paid_at >= ${gte} AND o.paid_at < ${lt} AND ${SOLD} AND ${cond} AND ${routeCond}
          GROUP BY 1 ORDER BY n DESC`,
      this.prisma.$queryRaw<
        { code: string; name: string; n: unknown; d: unknown }[]
      >`
          SELECT pr.code, pr.name, COUNT(*) n, SUM(op.discount_applied) d
          FROM order_promotions op JOIN orders o ON o.id = op.order_id JOIN promotions pr ON pr.id = op.promotion_id
          WHERE o.paid_at >= ${gte} AND o.paid_at < ${lt} AND ${cond}
          GROUP BY 1, 2 ORDER BY d DESC`,
      this.settings.get('commissions.vendor_percent'),
    ]);

    const gross = payRows.reduce((a, r) => a + toCents(num(r.s)), 0);
    const refunded = refRows.reduce((a, r) => a + toCents(num(r.s)), 0);
    const [tt] = ticketTotals;
    const tickets = num(tt.n);
    const fare = toCents(num(tt.fare));
    const orders = orderRows.reduce((a, r) => a + num(r.n), 0);
    const prev = previousRange(q.from, q.to);
    const before = await this.totals(q, prev.from, prev.to);
    const summary = {
      gross: fromCents(gross),
      refunds: fromCents(refunded),
      net: fromCents(gross - refunded),
      orders,
      tickets,
      avgTicket: tickets ? fromCents(Math.round(fare / tickets)) : 0,
      vat: num(tt.vat),
      passengerDiscounts: num(tt.pd),
      promoDiscounts: num(tt.pr),
      previous: { ...prev, ...before },
      change: {
        gross: change(fromCents(gross), before.gross),
        net: change(fromCents(gross - refunded), before.net),
        tickets: change(tickets, before.tickets),
      },
    };

    type DayVals = Record<'gross' | 'refunds' | 'tickets', number>;
    const days = sumBy<'gross' | 'refunds' | 'tickets'>([
      ...daysOf(q.from, q.to).map((d): [string, DayVals] => [
        d,
        { gross: 0, refunds: 0, tickets: 0 },
      ]),
      ...payRows.map((r): [string, DayVals] => [
        r.day,
        { gross: num(r.s), refunds: 0, tickets: 0 },
      ]),
      ...refRows.map((r): [string, DayVals] => [
        r.day,
        { gross: 0, refunds: num(r.s), tickets: 0 },
      ]),
      ...ticketDays.map((r): [string, DayVals] => [
        r.day,
        { gross: 0, refunds: 0, tickets: num(r.n) },
      ]),
    ])
      .filter((d) => d.key >= q.from && d.key <= q.to)
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((d) => ({
        date: d.key,
        gross: d.gross,
        refunds: d.refunds,
        net: fromCents(toCents(d.gross) - toCents(d.refunds)),
        tickets: d.tickets,
      }));

    type MethodVals = Record<'sales' | 'refunds', number>;
    const byMethod = sumBy<'sales' | 'refunds'>(
      [
        ...payRows.map((r): [string, MethodVals] => [
          r.method,
          { sales: num(r.s), refunds: 0 },
        ]),
        ...refRows.map((r): [string, MethodVals] => [
          r.method,
          { sales: 0, refunds: num(r.s) },
        ]),
      ],
      'sales',
    ).map((m) => ({
      method: m.key,
      sales: m.sales,
      refunds: m.refunds,
      net: fromCents(toCents(m.sales) - toCents(m.refunds)),
    }));

    const byChannel = sumBy<'gross'>(
      payRows.map((r) => [r.channel, { gross: num(r.s) }]),
      'gross',
    ).map((c) => ({
      channel: c.key,
      gross: c.gross,
    }));

    // Por vendedor: ventas por quien vendió; reembolsos por quien los hizo (como en la caja)
    const names = new Map(sellerNames.map((u) => [u.id, u.fullName]));
    type SellerVals = Record<'gross' | 'refunds' | 'orders', number>;
    const bySeller = sumBy<'gross' | 'refunds' | 'orders'>(
      [
        ...payRows.map((r): [string, SellerVals] => [
          r.seller ?? 'online',
          { gross: num(r.s), refunds: 0, orders: 0 },
        ]),
        ...refRows.map((r): [string, SellerVals] => [
          r.by ?? 'online',
          { gross: 0, refunds: num(r.s), orders: 0 },
        ]),
        ...orderRows.map((r): [string, SellerVals] => [
          r.seller ?? 'online',
          { gross: 0, refunds: 0, orders: num(r.n) },
        ]),
      ],
      'gross',
    ).map((s) => {
      const net = fromCents(toCents(s.gross) - toCents(s.refunds));
      return {
        sellerId: s.key === 'online' ? null : s.key,
        name: s.key === 'online' ? 'En línea' : (names.get(s.key) ?? '—'),
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
      byRoute: routeRows.map((r) => ({
        routeId: r.id,
        code: r.code,
        name: r.name,
        tickets: num(r.n),
        revenue: num(r.s),
        share: fare ? Math.round((toCents(num(r.s)) / fare) * 1000) / 10 : 0,
      })),
      byLeg: legRows.map((l) => ({
        leg: l.leg,
        tickets: num(l.n),
        revenue: num(l.s),
      })),
      byPassengerType: typeRows.map((t) => ({
        type: t.type,
        tickets: num(t.n),
        discount: num(t.d),
        revenue: num(t.s),
      })),
      byPromotion: promoRows.map((p) => ({
        code: p.code,
        name: p.name,
        orders: num(p.n),
        discount: num(p.d),
      })),
    };
  }
}
