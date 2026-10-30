import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { dateKey, toDate, today } from '../common/dates.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  ActionType,
  DiscountType,
  OrderStatus,
  TicketStatus,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AvailabilityService } from './availability.service.js';
import { PromotionDto, UpdatePromotionDto } from './dto/promotion.dto.js';
import { fromCents, toCents } from './money.js';
import {
  orderTotals,
  priceTickets,
  promotionDiscount,
  promotionError,
  type PromotionRule,
} from './pricing-rules.js';

type PromotionRow = Prisma.PromotionGetPayload<object>;

const rule = (p: PromotionRow): PromotionRule => ({
  discountType: p.discountType,
  discountValue: Number(p.discountValue),
  maxDiscount: p.maxDiscount == null ? null : Number(p.maxDiscount),
  maxUses: p.maxUses,
  usesCount: p.usesCount,
  minPurchase: Number(p.minPurchase),
  validFrom: dateKey(p.validFrom),
  validUntil: dateKey(p.validUntil),
  channels: p.channels,
  isActive: p.isActive,
});

/** Estado para la lista: vigente, por empezar, terminada, agotada o inactiva. */
export function promotionStatus(p: PromotionRow, todayKey: string) {
  if (!p.isActive) return 'inactive';
  if (todayKey < dateKey(p.validFrom)) return 'upcoming';
  if (todayKey > dateKey(p.validUntil)) return 'ended';
  if (p.maxUses != null && p.usesCount >= p.maxUses) return 'exhausted';
  return 'current';
}

/**
 * Promociones (códigos de descuento): catálogo y su uso en la compra. El descuento se acumula
 * con el del tipo de pasajero (decisión 6.6) y se recalcula en el servidor; el uso se cuenta al cobrar.
 */
@Injectable()
export class PromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Catálogo ----------

  async list() {
    const [rows, stats] = await Promise.all([
      this.prisma.promotion.findMany({
        orderBy: [{ isActive: 'desc' }, { validUntil: 'desc' }],
        include: { createdBy: { select: { fullName: true } } },
      }),
      // Descuento otorgado en compras cobradas
      this.prisma.orderPromotion.groupBy({
        by: ['promotionId'],
        where: {
          order: {
            status: { in: [OrderStatus.paid, OrderStatus.cancelled] },
            paidAt: { not: null },
          },
        },
        _sum: { discountApplied: true },
        _count: true,
      }),
    ]);
    const now = dateKey(today());
    return rows.map((p) => {
      const s = stats.find((x) => x.promotionId === p.id);
      return {
        ...p,
        status: promotionStatus(p, now),
        orders: s?._count ?? 0,
        discountGiven: Number(s?._sum.discountApplied ?? 0),
      };
    });
  }

  private check(dto: Partial<PromotionDto>, current?: PromotionRow) {
    const type = dto.discountType ?? current?.discountType;
    const value =
      dto.discountValue ??
      (current ? Number(current.discountValue) : undefined);
    if (type === DiscountType.percent && value != null && value > 100)
      throw new BadRequestException('El porcentaje no puede pasar de 100');
    const from =
      dto.validFrom ?? (current ? dateKey(current.validFrom) : undefined);
    const until =
      dto.validUntil ?? (current ? dateKey(current.validUntil) : undefined);
    if (from && until && until < from)
      throw new BadRequestException('La vigencia termina antes de empezar');
  }

  private data(dto: Partial<PromotionDto>) {
    const { validFrom, validUntil, ...rest } = dto;
    return {
      ...rest,
      ...(validFrom ? { validFrom: toDate(validFrom) } : {}),
      ...(validUntil ? { validUntil: toDate(validUntil) } : {}),
    };
  }

  async create(dto: PromotionDto, actor: AuthUser) {
    this.check(dto);
    const row = await this.prisma.promotion.create({
      data: {
        ...dto,
        validFrom: toDate(dto.validFrom),
        validUntil: toDate(dto.validUntil),
        createdById: actor.id,
      },
    });
    await this.audit.log({
      userId: actor.id,
      tableName: 'promotions',
      recordId: row.id,
      actionType: ActionType.insert,
      oldValues: null,
      newValues: row,
    });
    return row;
  }

  async update(id: string, dto: UpdatePromotionDto, actor: AuthUser) {
    const before = await this.prisma.promotion.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Promoción no encontrada');
    this.check(dto, before);
    if (dto.code && dto.code !== before.code && before.usesCount > 0)
      throw new BadRequestException(
        'La promoción ya se usó; no se puede cambiar su clave',
      );
    const row = await this.prisma.promotion.update({
      where: { id },
      data: this.data(dto),
    });
    await this.audit.log({
      userId: actor.id,
      tableName: 'promotions',
      recordId: id,
      actionType: ActionType.update,
      oldValues: before,
      newValues: row,
    });
    return row;
  }

  // ---------- En la compra ----------

  /**
   * Recalcula los precios de una compra pendiente con su promoción (si tiene). Si la promoción ya
   * no aplica (p. ej. dejó de cumplir la compra mínima) se quita y se devuelve el motivo.
   */
  async reprice(
    orderId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<string | null> {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        promotions: { include: { promotion: true } },
        tickets: {
          where: { status: TicketStatus.held },
          orderBy: { seatNumber: 'asc' },
          include: {
            passengerType: true,
            trip: { select: { tripDate: true } },
          },
        },
      },
    });
    if (!order.tickets.length) return null;
    const [season, { tax }] = await Promise.all([
      this.availability.seasonOf(order.tickets[0].trip.tripDate),
      this.availability.pricingContext(),
    ]);
    const inputs = order.tickets.map((t) => ({
      basePrice: Number(t.basePrice),
      passengerType: {
        discountPercent: Number(t.passengerType.discountPercent),
        seasonTypes: t.passengerType.seasonTypes,
      },
      seasonType: season?.seasonType ?? null,
    }));
    // Importe con el descuento de pasajero: sobre él se valida la mínima y se calcula la promoción
    const base = priceTickets(
      inputs,
      { ...tax, onlinePercent: 0 },
      order.channel,
    );
    const amount = fromCents(
      base.reduce(
        (a, p) => a + toCents(p.basePrice) - toCents(p.passengerDiscount),
        0,
      ),
    );
    const applied = order.promotions[0];
    let promo = 0;
    let removed: string | null = null;
    if (applied) {
      const err = promotionError(rule(applied.promotion), {
        amount,
        channel: order.channel,
        today: dateKey(today()),
      });
      if (err) {
        await tx.orderPromotion.delete({ where: { id: applied.id } });
        removed = `Se quitó la promoción ${applied.promotion.code}: ${err}`;
      } else promo = promotionDiscount(rule(applied.promotion), amount);
    }
    const prices = priceTickets(inputs, tax, order.channel, promo);
    for (const [i, t] of order.tickets.entries())
      await tx.ticket.update({ where: { id: t.id }, data: prices[i] });
    await tx.order.update({
      where: { id: order.id },
      data: orderTotals(prices),
    });
    if (applied && !removed)
      await tx.orderPromotion.update({
        where: { id: applied.id },
        data: { discountApplied: promo },
      });
    return removed;
  }

  /** Aplica un código a una compra pendiente (una promoción por compra). */
  async apply(orderId: string, code: string, user: AuthUser) {
    const order = await this.availability.ownPendingOrder(orderId, user);
    const promo = await this.prisma.promotion.findUnique({ where: { code } });
    if (!promo)
      throw new NotFoundException('No existe una promoción con esa clave');
    const removed = await this.prisma.$transaction(async (tx) => {
      await tx.orderPromotion.deleteMany({ where: { orderId: order.id } });
      await tx.orderPromotion.create({
        data: { orderId: order.id, promotionId: promo.id, discountApplied: 0 },
      });
      return this.reprice(order.id, tx);
    });
    // Si no aplica, se informa como error (el recálculo ya la quitó)
    if (removed)
      throw new BadRequestException(
        removed.replace(/^Se quitó la promoción \S+: /, ''),
      );
    return this.availability.order(order.id, user);
  }

  async remove(orderId: string, user: AuthUser) {
    const order = await this.availability.ownPendingOrder(orderId, user);
    await this.prisma.$transaction(async (tx) => {
      await tx.orderPromotion.deleteMany({ where: { orderId: order.id } });
      await this.reprice(order.id, tx);
    });
    return this.availability.order(order.id, user);
  }

  /** Al cobrar: cuenta el uso sin pasar del máximo (dos cobros simultáneos no lo rebasan). */
  async consume(tx: Prisma.TransactionClient, orderId: string) {
    const applied = await tx.orderPromotion.findFirst({
      where: { orderId },
      include: { promotion: true },
    });
    if (!applied) return;
    const p = applied.promotion;
    const ok = await tx.promotion.updateMany({
      where: {
        id: p.id,
        isActive: true,
        ...(p.maxUses != null ? { usesCount: { lt: p.maxUses } } : {}),
      },
      data: { usesCount: { increment: 1 } },
    });
    if (ok.count !== 1)
      throw new ConflictException(
        `La promoción ${p.code} se agotó o se desactivó mientras se cobraba; quítala para continuar`,
      );
  }
}
