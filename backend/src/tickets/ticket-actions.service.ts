import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CashService } from '../cash/cash.service.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  ActionType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  TicketEventType,
  TicketStatus,
  UserRole,
} from '../generated/prisma/enums.js';
import { brandedEmail, MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { TripStatusService } from '../trips/trip-status.service.js';
import { AvailabilityService } from './availability.service.js';
import { cancellationQuote } from './cancellation-rules.js';
import { changeQuote, overrideError, refundError } from './change-rules.js';
import {
  CancelTicketsDto,
  CompleteChangeDto,
  RefundDto,
  StartChangeDto,
} from './dto/change.dto.js';
import { fromCents, toCents } from './money.js';
import { distribute } from './pricing-rules.js';
import { checkPayments } from './sale-rules.js';
import { SaleService } from './sale.service.js';

const ticketInclude = {
  order: true,
  trip: {
    select: {
      id: true,
      tripNumber: true,
      status: true,
      departureAt: true,
      route: { select: { code: true, name: true } },
    },
  },
} satisfies Prisma.TicketInclude;

type TicketRow = Prisma.TicketGetPayload<{ include: typeof ticketInclude }>;

/** Lo que se le devuelve a un boleto según la política, o su saldo si la empresa canceló el recorrido. */
export interface TicketQuote {
  ticketId: string;
  ticketNumber: string;
  seatNumber: string;
  passengerName: string;
  total: number;
  /** El recorrido se canceló y el boleto tiene saldo por devolver */
  refundDue: boolean;
  inWindow: boolean;
  deadline: Date;
  refund: number;
}

/**
 * Cancelaciones, reembolsos y cambios de boleto; boletos de recorridos cancelados.
 * Cualquier taquilla atiende cualquier compra: el pasajero puede volver a otra ventanilla.
 */
@Injectable()
export class TicketActionsService implements OnModuleInit {
  private readonly logger = new Logger(TicketActionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly cash: CashService,
    private readonly availability: AvailabilityService,
    private readonly sale: SaleService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly tripStatus: TripStatusService,
  ) {}

  onModuleInit() {
    this.tripStatus.onCancelled((tripId, reason, actor) =>
      this.cancelTripTickets(tripId, reason, actor),
    );
  }

  private async policy() {
    const [cancellationHours, refundPercent] = await Promise.all([
      this.settings.get('tickets.cancellation_hours'),
      this.settings.get('tickets.refund_percent'),
    ]);
    return { cancellationHours, refundPercent };
  }

  private async loadTickets(ids: string[]) {
    const tickets = await this.prisma.ticket.findMany({
      where: { id: { in: ids } },
      include: ticketInclude,
    });
    if (tickets.length !== new Set(ids).size)
      throw new NotFoundException('Boleto no encontrado');
    if (new Set(tickets.map((t) => t.orderId)).size > 1)
      throw new BadRequestException(
        'Cancela los boletos de una compra a la vez',
      );
    return tickets;
  }

  private quoteOf(
    t: TicketRow,
    policy: { cancellationHours: number; refundPercent: number },
    now: Date,
  ): TicketQuote {
    const base = {
      ticketId: t.id,
      ticketNumber: t.ticketNumber,
      seatNumber: t.seatNumber,
      passengerName: t.passengerName,
      total: Number(t.total),
    };
    if (t.status === TicketStatus.cancelled && Number(t.refundDue ?? 0) > 0)
      return {
        ...base,
        refundDue: true,
        inWindow: true,
        deadline: t.boardAt,
        refund: Number(t.refundDue),
      };
    if (t.status !== TicketStatus.confirmed)
      throw new BadRequestException(
        t.status === TicketStatus.checked_in
          ? `El boleto ${t.ticketNumber} ya abordó; no se puede cancelar`
          : `El boleto ${t.ticketNumber} no está vigente`,
      );
    const q = cancellationQuote(
      {
        total: Number(t.total),
        serviceFee: Number(t.serviceFee),
        boardAt: t.boardAt,
        now,
      },
      policy,
    );
    return { ...base, refundDue: false, ...q };
  }

  /** Cotización de la cancelación: plazo y monto a devolver por boleto. */
  async quoteCancel(ticketIds: string[], user: AuthUser) {
    const tickets = await this.loadTickets(ticketIds);
    const policy = await this.policy();
    const now = new Date();
    const quotes = tickets.map((t) => this.quoteOf(t, policy, now));
    return {
      quotes,
      refund: fromCents(quotes.reduce((a, q) => a + toCents(q.refund), 0)),
      allInWindow: quotes.every((q) => q.inWindow),
      canOverride: user.role === UserRole.admin,
      policy,
    };
  }

  private checkRefund(refund: RefundDto | undefined, amount: number) {
    if (amount <= 0) return;
    if (!refund)
      throw new BadRequestException('Indica cómo se devuelve el dinero');
    const err = refundError(refund.method, refund.reference);
    if (err) throw new BadRequestException(err);
  }

  /** Cancela boletos (o reembolsa el saldo de un recorrido cancelado) y devuelve el dinero por caja. */
  async cancel(dto: CancelTicketsDto, user: AuthUser) {
    const tickets = await this.loadTickets(dto.ticketIds);
    const order = tickets[0].order;
    const policy = await this.policy();
    const now = new Date();
    const quotes = tickets.map((t) => this.quoteOf(t, policy, now));

    let amounts = quotes.map((q) => q.refund);
    const late = quotes.some((q) => !q.inWindow);
    if (late) {
      if (user.role !== UserRole.admin)
        throw new ForbiddenException(
          `Pasó el plazo de cancelación (${policy.cancellationHours} h antes de la salida); solo un administrador puede cancelar`,
        );
      if (dto.overrideAmount == null)
        throw new BadRequestException(
          'Fuera de plazo: indica cuánto se devuelve (puede ser $0)',
        );
      const paid = quotes.reduce((a, q) => a + q.total, 0);
      const err = overrideError(dto.overrideAmount, paid);
      if (err) throw new BadRequestException(err);
      amounts = distribute(
        dto.overrideAmount,
        quotes.map((q) => q.total),
      );
    }
    const total = fromCents(amounts.reduce((a, x) => a + toCents(x), 0));
    this.checkRefund(dto.refund, total);

    await this.prisma.$transaction(async (tx) => {
      const session =
        total > 0 ? await this.cash.requireOpen(user.id, tx) : null;
      if (session && dto.refund!.method === PaymentMethod.cash)
        await this.cash.checkCashOut(session, total);
      for (const [i, t] of tickets.entries()) {
        const q = quotes[i];
        // Solo cambia el boleto si sigue como se cotizó (evita doble cancelación simultánea)
        const updated = await tx.ticket.updateMany({
          where: q.refundDue
            ? { id: t.id, status: TicketStatus.cancelled, refundDue: { gt: 0 } }
            : { id: t.id, status: TicketStatus.confirmed },
          data: q.refundDue
            ? { refundDue: null }
            : {
                status: TicketStatus.cancelled,
                cancelledAt: now,
                cancelReason: dto.reason,
              },
        });
        if (updated.count !== 1)
          throw new ConflictException(
            `El boleto ${t.ticketNumber} cambió mientras se cancelaba; vuelve a intentar`,
          );
        if (!q.refundDue)
          await tx.ticketEvent.create({
            data: {
              ticketId: t.id,
              type: TicketEventType.cancelled,
              userId: user.id,
              detail: { reason: dto.reason, inWindow: q.inWindow },
            },
          });
        if (amounts[i] > 0) {
          const refund = await tx.refund.create({
            data: {
              orderId: t.orderId,
              ticketId: t.id,
              method: dto.refund!.method,
              amount: amounts[i],
              reason: q.refundDue
                ? `Recorrido cancelado · ${dto.reason}`
                : dto.reason,
              cashSessionId: session!.id,
              createdById: user.id,
            },
          });
          await this.cash.recordRefund(
            tx,
            session!.id,
            { id: refund.id, method: refund.method, amount: amounts[i] },
            user.id,
          );
          await tx.ticketEvent.create({
            data: {
              ticketId: t.id,
              type: TicketEventType.refunded,
              userId: user.id,
              detail: {
                amount: amounts[i],
                method: dto.refund!.method,
                reference: dto.refund!.reference ?? null,
              },
            },
          });
        }
      }
      // La compra se cancela cuando ya no le queda ningún boleto vigente
      const active = await tx.ticket.count({
        where: {
          orderId: order.id,
          status: { in: [TicketStatus.confirmed, TicketStatus.checked_in] },
        },
      });
      if (!active && order.status === OrderStatus.paid)
        await tx.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.cancelled, cancelledAt: now },
        });
    });
    await this.audit.log({
      userId: user.id,
      tableName: 'tickets',
      recordId: order.id,
      actionType: ActionType.update,
      oldValues: {
        tickets: tickets.map((t) => ({ id: t.id, status: t.status })),
      },
      newValues: {
        status: TicketStatus.cancelled,
        refund: total,
        method: dto.refund?.method ?? null,
        late,
      },
    });
    return { orderId: order.id, refund: total };
  }

  // ---------- Cambios ----------

  /** Boleto que se cambia por el apartado `newTicketId` (lo marca `replaced_by` al iniciar). */
  private oldOf(newTicketId: string) {
    return this.prisma.ticket.findFirst({
      where: { replacedById: newTicketId },
      include: ticketInclude,
    });
  }

  /** Si se puede cambiar: vigente y en plazo, o con saldo de un recorrido cancelado (reubicación). */
  private async changeable(t: TicketRow) {
    const relocation =
      t.status === TicketStatus.cancelled && Number(t.refundDue ?? 0) > 0;
    if (relocation) return { relocation };
    if (t.status !== TicketStatus.confirmed)
      throw new BadRequestException(
        `El boleto ${t.ticketNumber} no se puede cambiar`,
      );
    const q = cancellationQuote(
      {
        total: Number(t.total),
        serviceFee: Number(t.serviceFee),
        boardAt: t.boardAt,
        now: new Date(),
      },
      await this.policy(),
    );
    if (!q.inWindow)
      throw new BadRequestException(
        'Pasó el plazo para cambiar el boleto (el mismo de cancelación)',
      );
    return { relocation };
  }

  /** Aparta el asiento nuevo con los datos del mismo pasajero; el cobro de la diferencia es otro paso. */
  async startChange(dto: StartChangeDto, user: AuthUser) {
    const [old] = await this.loadTickets([dto.ticketId]);
    await this.changeable(old);
    if (old.replacedById) {
      const pending = await this.prisma.ticket.findUnique({
        where: { id: old.replacedById },
      });
      if (pending?.status === TicketStatus.held)
        throw new ConflictException(
          'Ese boleto ya tiene un cambio en curso; termínalo o suelta el apartado',
        );
    }
    const held = await this.availability.hold(
      {
        tripId: dto.tripId,
        boardIndex: dto.boardIndex,
        alightIndex: dto.alightIndex,
        seats: [dto.seat],
      },
      user,
    );
    const newTicket = held.tickets[0];
    // Mismo pasajero: nombre, tipo e identificación; recalcula precio y cupo
    await this.sale.setPassengers(
      held.id,
      {
        passengers: [
          {
            ticketId: newTicket.id,
            name: old.passengerName,
            passengerTypeId: old.passengerTypeId,
            document: old.passengerDocument,
          },
        ],
        contactEmail: old.order.contactEmail,
        contactPhone: old.order.contactPhone,
      },
      user,
    );
    await this.prisma.$transaction([
      this.prisma.ticket.update({
        where: { id: old.id },
        data: { replacedById: newTicket.id },
      }),
      this.prisma.order.update({
        where: { id: held.id },
        data: { notes: `Cambio del boleto ${old.ticketNumber}` },
      }),
    ]);
    return this.changeView(held.id, user);
  }

  /** Apartado de un cambio con su cotización (lo que paga o se le devuelve al cliente). */
  async changeView(orderId: string, user: AuthUser) {
    const order = await this.availability.order(orderId, user);
    const newTicket = order.tickets[0];
    const old = newTicket ? await this.oldOf(newTicket.id) : null;
    if (!old)
      throw new BadRequestException('Esa compra no es un cambio de boleto');
    const relocation =
      old.status === TicketStatus.cancelled && Number(old.refundDue ?? 0) > 0;
    const fee =
      relocation || old.tripId === newTicket.tripId
        ? 0
        : await this.settings.get('tickets.change_fee');
    const quote = changeQuote({
      newTotal: Number(newTicket.total),
      credit: relocation ? Number(old.refundDue) : Number(old.total),
      fee,
    });
    return {
      ...order,
      change: {
        relocation,
        sameTrip: old.tripId === newTicket.tripId,
        old: {
          id: old.id,
          ticketNumber: old.ticketNumber,
          orderId: old.orderId,
          orderNumber: old.order.orderNumber,
          seatNumber: old.seatNumber,
          total: Number(old.total),
          refundDue: old.refundDue == null ? null : Number(old.refundDue),
          tripNumber: old.trip.tripNumber,
          departureAt: old.trip.departureAt,
        },
        quote,
      },
    };
  }

  /** Cobra la diferencia (o la devuelve) y confirma el boleto nuevo; el anterior queda como cambiado. */
  async completeChange(
    orderId: string,
    dto: CompleteChangeDto,
    user: AuthUser,
  ) {
    const view = await this.changeView(orderId, user);
    const order = await this.availability.ownPendingOrder(orderId, user);
    const newTicket = order.tickets.find((t) => t.status === TicketStatus.held);
    if (!newTicket)
      throw new BadRequestException(
        'El apartado del cambio ya no está vigente',
      );
    const old = (await this.oldOf(newTicket.id))!;
    const { relocation } = await this.changeable(old);
    const { quote } = view.change;

    if (quote.due > 0) {
      const check = checkPayments(dto.payments ?? [], quote.due);
      if (!check.ok) throw new BadRequestException(check.error);
    }
    this.checkRefund(dto.refund, quote.refund);

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const session = await this.cash.requireOpen(user.id, tx);
      if (quote.refund > 0 && dto.refund!.method === PaymentMethod.cash)
        await this.cash.checkCashOut(session, quote.refund);
      const claimed = await tx.order.updateMany({
        where: {
          id: order.id,
          status: OrderStatus.pending,
          expiresAt: { gt: now },
        },
        data: {
          status: OrderStatus.paid,
          paidAt: now,
          expiresAt: null,
          cashSessionId: session.id,
          notes: `Cambio del boleto ${old.ticketNumber}: diferencia $${quote.difference.toFixed(2)}, cargo $${quote.fee.toFixed(2)}`,
        },
      });
      if (claimed.count !== 1)
        throw new ConflictException(
          'El apartado venció mientras se cobraba; aparta de nuevo',
        );
      const oldUpdated = await tx.ticket.updateMany({
        where: relocation
          ? { id: old.id, status: TicketStatus.cancelled, refundDue: { gt: 0 } }
          : { id: old.id, status: TicketStatus.confirmed },
        data: relocation
          ? { refundDue: null }
          : { status: TicketStatus.changed },
      });
      if (oldUpdated.count !== 1)
        throw new ConflictException(
          `El boleto ${old.ticketNumber} cambió mientras se procesaba`,
        );

      const payments = [];
      for (const p of quote.due > 0 ? (dto.payments ?? []) : [])
        payments.push(
          await tx.payment.create({
            data: {
              orderId: order.id,
              method: p.method,
              status: PaymentStatus.approved,
              amount: p.amount,
              received:
                p.method === PaymentMethod.cash
                  ? (p.received ?? p.amount)
                  : null,
              reference: p.reference ?? null,
              recordedById: user.id,
              cashSessionId: session.id,
              paidAt: now,
            },
          }),
        );
      await this.cash.recordSale(tx, session.id, payments, user.id);
      if (quote.refund > 0) {
        const refund = await tx.refund.create({
          data: {
            orderId: old.orderId,
            ticketId: old.id,
            method: dto.refund!.method,
            amount: quote.refund,
            reason: `Diferencia a favor por cambio al boleto ${newTicket.ticketNumber}`,
            cashSessionId: session.id,
            createdById: user.id,
          },
        });
        await this.cash.recordRefund(
          tx,
          session.id,
          { id: refund.id, method: refund.method, amount: quote.refund },
          user.id,
        );
        await tx.ticketEvent.create({
          data: {
            ticketId: old.id,
            type: TicketEventType.refunded,
            userId: user.id,
            detail: {
              amount: quote.refund,
              method: dto.refund!.method,
              reference: dto.refund!.reference ?? null,
            },
          },
        });
      }
      await tx.ticket.update({
        where: { id: newTicket.id },
        data: {
          status: TicketStatus.confirmed,
          qrToken: this.sale.qrFor(newTicket.id),
        },
      });
      await tx.ticketEvent.createMany({
        data: [
          {
            ticketId: newTicket.id,
            type: TicketEventType.confirmed,
            userId: user.id,
            detail: { changeOf: old.ticketNumber },
          },
          {
            ticketId: old.id,
            type: TicketEventType.changed,
            userId: user.id,
            detail: { to: newTicket.ticketNumber, relocation, ...quote },
          },
        ],
      });
      // La compra anterior se cancela si ya no le queda ningún boleto vigente
      const active = await tx.ticket.count({
        where: {
          orderId: old.orderId,
          status: { in: [TicketStatus.confirmed, TicketStatus.checked_in] },
        },
      });
      if (!active && old.order.status === OrderStatus.paid)
        await tx.order.update({
          where: { id: old.orderId },
          data: { status: OrderStatus.cancelled, cancelledAt: now },
        });
    });
    await this.audit.log({
      userId: user.id,
      tableName: 'tickets',
      recordId: old.id,
      actionType: ActionType.update,
      oldValues: { ticket: old.ticketNumber, status: old.status },
      newValues: { replacedBy: newTicket.ticketNumber, ...quote },
    });
    const email = old.order.contactEmail;
    if (email)
      void this.sale
        .sendTickets(order.id, email)
        .catch((err: unknown) =>
          this.logger.error(
            `No se envió el boleto del cambio ${order.orderNumber}`,
            err,
          ),
        );
    return {
      ...(await this.availability.order(order.id, user)),
      change: { ...view.change, quote },
    };
  }

  // ---------- Recorrido cancelado ----------

  /** La empresa canceló el recorrido: suelta apartados y deja a cada boleto con saldo por devolver (100 %). */
  async cancelTripTickets(tripId: string, reason: string, actor: AuthUser) {
    const tickets = await this.prisma.ticket.findMany({
      where: {
        tripId,
        status: {
          in: [
            TicketStatus.held,
            TicketStatus.confirmed,
            TicketStatus.checked_in,
          ],
        },
      },
      include: { order: true },
    });
    if (!tickets.length) return;
    const now = new Date();
    const cancelReason = `Recorrido cancelado${reason ? `: ${reason}` : ''}`;
    const held = tickets.filter((t) => t.status === TicketStatus.held);
    const sold = tickets.filter((t) => t.status !== TicketStatus.held);
    await this.prisma.$transaction(async (tx) => {
      if (held.length) {
        await tx.ticket.updateMany({
          where: { id: { in: held.map((t) => t.id) } },
          data: {
            status: TicketStatus.cancelled,
            cancelledAt: now,
            cancelReason,
          },
        });
        await tx.order.updateMany({
          where: {
            id: { in: [...new Set(held.map((t) => t.orderId))] },
            status: OrderStatus.pending,
          },
          data: { status: OrderStatus.cancelled, cancelledAt: now },
        });
      }
      for (const t of sold)
        await tx.ticket.update({
          where: { id: t.id },
          data: {
            status: TicketStatus.cancelled,
            cancelledAt: now,
            cancelReason,
            refundDue: t.total,
          },
        });
      await tx.ticketEvent.createMany({
        data: tickets.map((t) => ({
          ticketId: t.id,
          type:
            t.status === TicketStatus.held
              ? TicketEventType.released
              : TicketEventType.cancelled,
          userId: actor.id,
          detail: { tripCancelled: true, reason },
        })),
      });
    });
    this.logger.log(
      `Recorrido ${tripId} cancelado: ${sold.length} boleto(s) con saldo por devolver`,
    );
    // Aviso por correo a quien dejó correo (una vez por compra)
    const orders = new Map(
      sold.filter((t) => t.order.contactEmail).map((t) => [t.orderId, t]),
    );
    for (const t of orders.values())
      void this.notifyTripCancelled(
        t.order.contactEmail!,
        t.order.orderNumber,
        reason,
      ).catch((err: unknown) =>
        this.logger.error(
          `No se avisó la cancelación a ${t.order.orderNumber}`,
          err,
        ),
      );
  }

  private async notifyTripCancelled(
    to: string,
    orderNumber: string,
    reason: string,
  ) {
    const company = String(
      (await this.settings.get('company.trade_name')) || 'Central Camionera',
    );
    const intro = `Lamentamos avisarte que se canceló el viaje de tu compra ${orderNumber}${reason ? ` (${reason})` : ''}. Tienes derecho al reembolso del 100 % o a cambiar sin costo a otra salida: acude a cualquier taquilla con tu folio.`;
    await this.mail.send({
      to,
      subject: `Tu viaje se canceló · ${orderNumber} · ${company}`,
      html: brandedEmail({ title: 'Tu viaje se canceló', intro }),
      text: intro,
    });
  }

  // ---------- Consulta ----------

  /** Compra completa: boletos en cualquier estado con su historial, pagos y reembolsos. */
  async full(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        seller: { select: { id: true, fullName: true } },
        customer: true,
        payments: { orderBy: { createdAt: 'asc' } },
        refunds: {
          orderBy: { createdAt: 'asc' },
          include: { createdBy: { select: { fullName: true } } },
        },
        tickets: {
          orderBy: [{ seatNumber: 'asc' }],
          include: {
            passengerType: { select: { id: true, name: true } },
            boardTerminal: {
              select: {
                code: true,
                name: true,
                cityId: true,
                city: { select: { name: true, timezone: true } },
              },
            },
            alightTerminal: {
              select: {
                code: true,
                name: true,
                cityId: true,
                city: { select: { name: true, timezone: true } },
              },
            },
            trip: {
              select: {
                id: true,
                tripNumber: true,
                status: true,
                departureAt: true,
                tripDate: true,
                route: { select: { code: true, name: true } },
                platform: { select: { code: true } },
              },
            },
            replacedBy: {
              select: { id: true, ticketNumber: true, orderId: true },
            },
            replaces: {
              select: { id: true, ticketNumber: true, orderId: true },
            },
            events: {
              orderBy: { createdAt: 'asc' },
              include: { user: { select: { fullName: true } } },
            },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Compra no encontrada');
    return order;
  }

  /** Busca una compra por folio de compra o de boleto, o por el contenido del QR. */
  async lookup(code: string) {
    const c = code.trim();
    const ticketId = this.sale.ticketOfQr(c);
    const order = await this.prisma.order.findFirst({
      where: {
        OR: [
          { orderNumber: { equals: c, mode: 'insensitive' } },
          {
            tickets: {
              some: { ticketNumber: { equals: c, mode: 'insensitive' } },
            },
          },
          ...(ticketId ? [{ tickets: { some: { id: ticketId } } }] : []),
        ],
      },
      select: { id: true, orderNumber: true },
    });
    if (!order)
      throw new NotFoundException('No hay una compra con ese folio o código');
    return order;
  }

  /** Pasajeros de un recorrido (vigentes y los que tienen saldo por devolver). */
  passengers(tripId: string) {
    return this.prisma.ticket.findMany({
      where: {
        tripId,
        OR: [
          {
            status: {
              in: [
                TicketStatus.confirmed,
                TicketStatus.checked_in,
                TicketStatus.no_show,
              ],
            },
          },
          { refundDue: { gt: 0 } },
        ],
      },
      orderBy: [{ boardIndex: 'asc' }, { seatNumber: 'asc' }],
      select: {
        id: true,
        ticketNumber: true,
        seatNumber: true,
        passengerName: true,
        status: true,
        refundDue: true,
        total: true,
        orderId: true,
        order: {
          select: { orderNumber: true, contactEmail: true, contactPhone: true },
        },
        passengerType: { select: { name: true } },
        boardTerminal: { select: { code: true } },
        alightTerminal: { select: { code: true } },
      },
    });
  }

  /** Para Pendientes: recorridos cancelados con boletos por reembolsar o reubicar. */
  async refundsDue() {
    const rows = await this.prisma.ticket.groupBy({
      by: ['tripId'],
      where: { refundDue: { gt: 0 } },
      _count: true,
      _sum: { refundDue: true },
    });
    if (!rows.length) return [];
    const trips = await this.prisma.trip.findMany({
      where: { id: { in: rows.map((r) => r.tripId) } },
      select: {
        id: true,
        tripNumber: true,
        departureAt: true,
        cancelledAt: true,
      },
    });
    return rows.map((r) => ({
      trip: trips.find((t) => t.id === r.tripId)!,
      count: r._count,
      amount: Number(r._sum.refundDue ?? 0),
    }));
  }
}
