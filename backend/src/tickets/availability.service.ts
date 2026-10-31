import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { dateKey } from '../common/dates.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  ActionType,
  OrderStatus,
  SaleChannel,
  TicketEventType,
  TicketStatus,
  UserRole,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { applySeason, seasonOn } from '../routes/season-rules.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  quotaLeft,
  seatStates,
  segmentError,
  type Segment,
} from './availability-rules.js';
import { HoldDto, UpdateHoldDto } from './dto/hold.dto.js';
import {
  canExtend,
  holdUntil,
  seatCountError,
  sellableError,
} from './hold-rules.js';
import {
  segmentBase,
  tripItinerary,
  type ItineraryPoint,
} from './itinerary-rules.js';
import { orderTotals, priceTickets } from './pricing-rules.js';
import { ACTIVE_STATUSES } from './ticket-status-rules.js';

const terminal = {
  select: {
    id: true,
    code: true,
    name: true,
    city: { select: { id: true, name: true, timezone: true } },
  },
} as const;

const tripInclude = {
  platform: { select: { id: true, code: true, name: true } },
  route: {
    select: {
      id: true,
      code: true,
      name: true,
      basePrice: true,
      originTerminal: terminal,
      destinationTerminal: terminal,
      stops: { orderBy: { stopOrder: 'asc' }, include: { terminal } },
    },
  },
  bus: {
    select: {
      id: true,
      economicNumber: true,
      busModel: {
        select: { brand: true, model: true, layout: true, busType: true },
      },
      seats: {
        select: {
          id: true,
          number: true,
          floor: true,
          row: true,
          col: true,
          category: true,
          isBlocked: true,
          blockReason: true,
          blockedAt: true,
        },
      },
    },
  },
} satisfies Prisma.TripInclude;

type TripRow = Prisma.TripGetPayload<{ include: typeof tripInclude }>;

type TerminalRow = {
  id: string;
  code: string;
  name: string;
  city: { id: string; name: string; timezone: string };
};
const pointOf = (t: TerminalRow) => ({
  terminalId: t.id,
  code: t.code,
  name: t.name,
  cityId: t.city.id,
  cityName: t.city.name,
  timezone: t.city.timezone,
});

/** Folios legibles a partir de las secuencias de la migración. */
const folio = (prefix: string, n: bigint) =>
  `${prefix}${String(n).padStart(7, '0')}`;

/** Disponibilidad de asientos por tramo y apartados temporales mientras se cobra. */
@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  async loadTrip(tripId: string): Promise<TripRow> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: tripInclude,
    });
    if (!trip) throw new NotFoundException('Recorrido no encontrado');
    return trip;
  }

  itinerary(trip: TripRow): ItineraryPoint[] {
    const r = trip.route;
    return tripItinerary(
      trip.departureAt,
      trip.durationMinutes,
      pointOf(r.originTerminal),
      r.stops.map((s) => ({
        ...pointOf(s.terminal),
        minutes: s.durationFromOriginMinutes,
        priceFromOrigin: Number(s.priceFromOrigin),
      })),
      {
        ...pointOf(r.destinationTerminal),
        priceFromOrigin: Number(r.basePrice),
      },
    );
  }

  async seasonOf(tripDate: Date) {
    const date = dateKey(tripDate);
    const seasons = await this.prisma.season.findMany({
      where: {
        isActive: true,
        validFrom: { lte: tripDate },
        validUntil: { gte: tripDate },
      },
    });
    return seasonOn(
      seasons.map((s) => ({
        ...s,
        validFrom: dateKey(s.validFrom),
        validUntil: dateKey(s.validUntil),
        priceModifierPercent: Number(s.priceModifierPercent),
      })),
      date,
    );
  }

  private checkSegment(points: ItineraryPoint[], segment: Segment) {
    const err = segmentError(segment, points.length);
    if (err) throw new BadRequestException(err);
  }

  private occupancyTickets(tripId: string) {
    return this.prisma.ticket.findMany({
      where: { tripId, status: { in: ACTIVE_STATUSES } },
      select: {
        seatNumber: true,
        boardIndex: true,
        alightIndex: true,
        status: true,
        passengerTypeId: true,
        order: { select: { id: true, sellerId: true, expiresAt: true } },
      },
    });
  }

  /** Mapa de asientos de un recorrido para un tramo, con precio y cupos. */
  async seats(tripId: string, segment: Segment, user: AuthUser) {
    const trip = await this.loadTrip(tripId);
    const points = this.itinerary(trip);
    this.checkSegment(points, segment);
    const now = new Date();
    const notSellable = sellableError(
      {
        status: trip.status,
        hasBus: !!trip.bus,
        departed: !!trip.actualDepartureAt,
      },
      points[segment.board].at,
      now,
    );

    const [tickets, season, types] = await Promise.all([
      this.occupancyTickets(tripId),
      this.seasonOf(trip.tripDate),
      this.prisma.passengerType.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    ]);
    const occupancy = tickets.map((t) => ({
      ...t,
      expiresAt: t.order.expiresAt,
    }));
    const seats = trip.bus?.seats ?? [];
    const states = seatStates(seats, occupancy, segment, now);
    // Asientos que el propio vendedor tiene apartados en este tramo
    const mine = new Map<string, string>();
    for (const t of occupancy)
      if (
        t.status === TicketStatus.held &&
        t.order.sellerId === user.id &&
        states.get(t.seatNumber) === 'held' &&
        t.boardIndex < segment.alight &&
        segment.board < t.alightIndex
      )
        mine.set(t.seatNumber, t.order.id);

    const base = segmentBase(points, segment.board, segment.alight);
    const pct = season?.priceModifierPercent ?? null;
    const counts = { free: 0, held: 0, occupied: 0, blocked: 0 };
    for (const s of states.values()) counts[s]++;

    return {
      trip: {
        id: trip.id,
        tripNumber: trip.tripNumber,
        status: trip.status,
        departureAt: trip.departureAt,
        // El andén solo aplica al abordar en la terminal de origen
        platform: segment.board === 0 ? trip.platform : null,
        route: {
          id: trip.route.id,
          code: trip.route.code,
          name: trip.route.name,
        },
      },
      sellable: !notSellable,
      notSellableReason: notSellable,
      bus: trip.bus && {
        id: trip.bus.id,
        economicNumber: trip.bus.economicNumber,
        model: trip.bus.busModel,
      },
      itinerary: points,
      segment: {
        ...segment,
        board: points[segment.board],
        alight: points[segment.alight],
      },
      price: {
        base,
        price: applySeason(base, pct),
        season: season && {
          name: season.name,
          seasonType: season.seasonType,
          priceModifierPercent: season.priceModifierPercent,
        },
      },
      seats: seats.map((s) => ({
        ...s,
        state: states.get(s.number) ?? 'free',
        heldOrderId: mine.get(s.number) ?? null,
      })),
      counts,
      passengerTypes: types.map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        discountPercent: Number(t.discountPercent),
        requiresId: t.requiresId,
        seasonTypes: t.seasonTypes,
        isDefault: t.isDefault,
        maxPerTrip: t.maxPerTrip,
        left: quotaLeft(
          t.maxPerTrip,
          occupancy.filter((o) => o.passengerTypeId === t.id),
          segment,
          now,
        ),
      })),
    };
  }

  /** Lugares libres de varios recorridos en un tramo (para la búsqueda de salidas). */
  async freeCounts(items: { tripId: string; board: number; alight: number }[]) {
    if (items.length === 0) return new Map<string, number>();
    const ids = [...new Set(items.map((i) => i.tripId))];
    const now = new Date();
    const [trips, tickets] = await Promise.all([
      this.prisma.trip.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          bus: {
            select: { seats: { select: { number: true, isBlocked: true } } },
          },
        },
      }),
      this.prisma.ticket.findMany({
        where: { tripId: { in: ids }, status: { in: ACTIVE_STATUSES } },
        select: {
          tripId: true,
          seatNumber: true,
          boardIndex: true,
          alightIndex: true,
          status: true,
          order: { select: { expiresAt: true } },
        },
      }),
    ]);
    const result = new Map<string, number>();
    for (const i of items) {
      const trip = trips.find((t) => t.id === i.tripId);
      if (!trip?.bus) continue;
      const states = seatStates(
        trip.bus.seats,
        tickets
          .filter((t) => t.tripId === i.tripId)
          .map((t) => ({ ...t, expiresAt: t.order.expiresAt })),
        i,
        now,
      );
      result.set(
        `${i.tripId}:${i.board}:${i.alight}`,
        [...states.values()].filter((s) => s === 'free').length,
      );
    }
    return result;
  }

  // ---------- Apartados ----------

  /** Libera los apartados vencidos (de un recorrido o de todos). */
  private async releaseExpired(
    tx: Prisma.TransactionClient,
    now: Date,
    tripId?: string,
  ) {
    const orders = await tx.order.findMany({
      where: {
        status: OrderStatus.pending,
        expiresAt: { lte: now },
        ...(tripId ? { tickets: { some: { tripId } } } : {}),
      },
      select: { id: true, tickets: { select: { id: true } } },
    });
    if (orders.length === 0) return 0;
    const ticketIds = orders.flatMap((o) => o.tickets.map((t) => t.id));
    await tx.ticket.updateMany({
      where: { id: { in: ticketIds }, status: TicketStatus.held },
      data: {
        status: TicketStatus.cancelled,
        cancelledAt: now,
        cancelReason: 'Venció el apartado',
      },
    });
    await tx.order.updateMany({
      where: { id: { in: orders.map((o) => o.id) } },
      data: { status: OrderStatus.expired },
    });
    await tx.ticketEvent.createMany({
      data: ticketIds.map((ticketId) => ({
        ticketId,
        type: TicketEventType.released,
        detail: { reason: 'expired' },
      })),
    });
    return orders.length;
  }

  /** Cada minuto: libera los apartados vencidos. */
  @Cron('* * * * *', { name: 'tickets-release-holds' })
  async releaseExpiredHolds() {
    try {
      const n = await this.prisma.$transaction((tx) =>
        this.releaseExpired(tx, new Date()),
      );
      if (n) this.logger.log(`Apartados vencidos liberados: ${n}`);
    } catch (err) {
      this.logger.error('No se pudieron liberar los apartados vencidos', err);
    }
  }

  async pricingContext() {
    const [vatRate, pricesIncludeVat, onlinePercent, defaultType] =
      await Promise.all([
        this.settings.get('taxes.vat_rate'),
        this.settings.get('taxes.prices_include_vat'),
        this.settings.get('commissions.online_percent'),
        this.prisma.passengerType.findFirst({
          where: { isDefault: true, isActive: true },
        }),
      ]);
    if (!defaultType)
      throw new BadRequestException(
        'No hay un tipo de pasajero predeterminado; configúralo en Parámetros › Boletos',
      );
    return { tax: { vatRate, pricesIncludeVat, onlinePercent }, defaultType };
  }

  /** Aparta asientos de un tramo mientras se cobra: crea una compra pendiente con boletos `held`. */
  async hold(dto: HoldDto, user: AuthUser) {
    const segment = { board: dto.boardIndex, alight: dto.alightIndex };
    const seatNumbers = [...new Set(dto.seats)];
    const [maxPerPurchase, holdMinutes] = await Promise.all([
      this.settings.get('tickets.max_per_purchase'),
      this.settings.get('tickets.hold_minutes'),
    ]);
    const countErr = seatCountError(seatNumbers.length, maxPerPurchase);
    if (countErr) throw new BadRequestException(countErr);

    const trip = await this.loadTrip(dto.tripId);
    const points = this.itinerary(trip);
    this.checkSegment(points, segment);
    const now = new Date();
    const notSellable = sellableError(
      {
        status: trip.status,
        hasBus: !!trip.bus,
        departed: !!trip.actualDepartureAt,
      },
      points[segment.board].at,
      now,
    );
    if (notSellable) throw new BadRequestException(notSellable);
    const seats = trip.bus?.seats ?? [];
    for (const n of seatNumbers) {
      const seat = seats.find((s) => s.number === n);
      if (!seat) throw new BadRequestException(`El asiento ${n} no existe`);
      if (seat.isBlocked)
        throw new BadRequestException(`El asiento ${n} está bloqueado`);
    }

    const [season, { tax, defaultType }] = await Promise.all([
      this.seasonOf(trip.tripDate),
      this.pricingContext(),
    ]);
    const base = segmentBase(points, segment.board, segment.alight);
    const basePrice = applySeason(base, season?.priceModifierPercent ?? null);
    const prices = priceTickets(
      seatNumbers.map(() => ({
        basePrice,
        passengerType: {
          discountPercent: Number(defaultType.discountPercent),
          seasonTypes: defaultType.seasonTypes,
        },
        seasonType: season?.seasonType ?? null,
      })),
      tax,
      SaleChannel.counter,
    );
    const totals = orderTotals(prices);
    const board = points[segment.board];
    const alight = points[segment.alight];

    try {
      const order = await this.prisma.$transaction(async (tx) => {
        await this.releaseExpired(tx, now, trip.id);
        const [{ n: orderSeq }] = await tx.$queryRaw<{ n: bigint }[]>`
          SELECT nextval('order_number_seq') AS n`;
        const order = await tx.order.create({
          data: {
            orderNumber: folio('C', orderSeq),
            channel: SaleChannel.counter,
            sellerId: user.id,
            expiresAt: holdUntil(now, holdMinutes),
            ...totals,
          },
        });
        for (const [i, seatNumber] of seatNumbers.entries()) {
          const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`
            SELECT nextval('ticket_number_seq') AS n`;
          const ticket = await tx.ticket.create({
            data: {
              ticketNumber: folio('B', n),
              orderId: order.id,
              tripId: trip.id,
              seatNumber,
              boardIndex: segment.board,
              alightIndex: segment.alight,
              boardTerminalId: board.terminalId,
              alightTerminalId: alight.terminalId,
              boardAt: board.at,
              alightAt: alight.at,
              // El pasajero se captura en la venta (6.2)
              passengerName: '',
              passengerTypeId: defaultType.id,
              seasonPercent: season?.priceModifierPercent ?? null,
              ...prices[i],
            },
          });
          await tx.ticketEvent.create({
            data: {
              ticketId: ticket.id,
              type: TicketEventType.held,
              userId: user.id,
            },
          });
        }
        return order;
      });
      return this.order(order.id, user);
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes('tickets_seat_no_overlap')
      )
        throw new ConflictException(
          'Otro vendedor acaba de apartar uno de esos asientos; actualiza el mapa y elige otro',
        );
      throw err;
    }
  }

  async ownPendingOrder(orderId: string, user: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { tickets: true },
    });
    if (!order) throw new NotFoundException('Apartado no encontrado');
    if (order.sellerId !== user.id && user.role !== UserRole.admin)
      throw new ForbiddenException('Ese apartado es de otro vendedor');
    if (order.status !== OrderStatus.pending)
      throw new BadRequestException('El apartado ya no está pendiente');
    if (order.expiresAt && order.expiresAt <= new Date())
      throw new BadRequestException('El apartado ya venció; aparta de nuevo');
    return order;
  }

  /** Compra con sus boletos (para el resumen del apartado). */
  async order(orderId: string, user: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        promotions: {
          select: {
            discountApplied: true,
            promotion: { select: { id: true, code: true, name: true } },
          },
        },
        tickets: {
          where: { status: { not: TicketStatus.cancelled } },
          orderBy: { seatNumber: 'asc' },
          include: {
            boardTerminal: { select: { code: true, name: true } },
            alightTerminal: { select: { code: true, name: true } },
            passengerType: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Compra no encontrada');
    if (
      order.sellerId !== user.id &&
      !([UserRole.admin, UserRole.supervisor] as UserRole[]).includes(user.role)
    )
      throw new ForbiddenException('Esa compra es de otro vendedor');
    const holdMinutes = await this.settings.get('tickets.hold_minutes');
    return {
      ...order,
      canExtend:
        order.status === OrderStatus.pending &&
        !!order.expiresAt &&
        canExtend(order.createdAt, order.expiresAt, holdMinutes),
    };
  }

  /** Quita asientos del apartado o lo extiende (una sola vez). */
  async updateHold(orderId: string, dto: UpdateHoldDto, user: AuthUser) {
    const order = await this.ownPendingOrder(orderId, user);
    const held = order.tickets.filter((t) => t.status === TicketStatus.held);
    const remove = held.filter((t) => dto.removeSeats?.includes(t.seatNumber));
    if (remove.length === held.length && remove.length > 0)
      throw new BadRequestException(
        'No se pueden quitar todos los asientos; suelta el apartado completo',
      );
    const holdMinutes = await this.settings.get('tickets.hold_minutes');
    if (
      dto.extend &&
      !canExtend(order.createdAt, order.expiresAt!, holdMinutes)
    )
      throw new BadRequestException('El apartado ya se extendió una vez');

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      if (remove.length) {
        await tx.ticket.updateMany({
          where: { id: { in: remove.map((t) => t.id) } },
          data: {
            status: TicketStatus.cancelled,
            cancelledAt: now,
            cancelReason: 'Se quitó del apartado',
          },
        });
        await tx.ticketEvent.createMany({
          data: remove.map((t) => ({
            ticketId: t.id,
            type: TicketEventType.released,
            userId: user.id,
            detail: { reason: 'removed' },
          })),
        });
        const left = held.filter((t) => !remove.includes(t));
        await tx.order.update({
          where: { id: order.id },
          data: orderTotals(
            left.map((t) => ({
              basePrice: Number(t.basePrice),
              passengerDiscount: Number(t.passengerDiscount),
              promoDiscount: Number(t.promoDiscount),
              vat: Number(t.vat),
              serviceFee: Number(t.serviceFee),
              total: Number(t.total),
            })),
          ),
        });
      }
      if (dto.extend)
        await tx.order.update({
          where: { id: order.id },
          data: {
            expiresAt: new Date(
              order.expiresAt!.getTime() + holdMinutes * 60_000,
            ),
          },
        });
    });
    return this.order(order.id, user);
  }

  /** Suelta el apartado completo. */
  async release(orderId: string, user: AuthUser) {
    const order = await this.ownPendingOrder(orderId, user);
    const now = new Date();
    const held = order.tickets.filter((t) => t.status === TicketStatus.held);
    await this.prisma.$transaction(async (tx) => {
      await tx.ticket.updateMany({
        where: { id: { in: held.map((t) => t.id) } },
        data: {
          status: TicketStatus.cancelled,
          cancelledAt: now,
          cancelReason: 'Se soltó el apartado',
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.cancelled, cancelledAt: now },
      });
      await tx.ticketEvent.createMany({
        data: held.map((t) => ({
          ticketId: t.id,
          type: TicketEventType.released,
          userId: user.id,
          detail: { reason: 'released' },
        })),
      });
    });
    await this.audit.log({
      userId: user.id,
      tableName: 'orders',
      recordId: order.id,
      actionType: ActionType.update,
      oldValues: { status: order.status },
      newValues: { status: OrderStatus.cancelled },
    });
    return { ok: true };
  }
}
