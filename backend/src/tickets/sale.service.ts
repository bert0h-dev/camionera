import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { paginate } from '../common/dto/pagination.dto.js';
import {
  addDays,
  dateKey,
  today,
  toDate,
  zonedDateTime,
} from '../common/dates.js';
import { FilesService } from '../files/files.service.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  ActionType,
  OrderStatus,
  PaymentStatus,
  TicketEventType,
  TicketStatus,
  UserRole,
} from '../generated/prisma/enums.js';
import { brandedEmail, MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { wallTime } from '../routes/route-rules.js';
import { SettingsService } from '../settings/settings.service.js';
import { occupies, overlaps } from './availability-rules.js';
import { AvailabilityService } from './availability.service.js';
import { CashService } from '../cash/cash.service.js';
import { PromotionsService } from './promotions.service.js';
import { PayDto, QueryOrdersDto, SetPassengersDto } from './dto/sale.dto.js';
import { orderTotals, priceTickets } from './pricing-rules.js';
import { qrToken, verifyQrToken } from './qr-token.js';
import { checkPayments, passengerError } from './sale-rules.js';
import { ticketsPdf, type TicketPdfTicket } from './ticket-pdf.js';
import { ACTIVE_STATUSES } from './ticket-status-rules.js';

const VIEWERS: UserRole[] = [UserRole.admin, UserRole.supervisor];

const DATE_FMT = (tz: string) =>
  new Intl.DateTimeFormat('es-MX', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

/** Venta en taquilla: pasajeros, cobro, boletos en PDF y envío por correo. */
@Injectable()
export class SaleService {
  private readonly logger = new Logger(SaleService.name);
  private readonly qrSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly settings: SettingsService,
    private readonly files: FilesService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly cash: CashService,
    private readonly promotions: PromotionsService,
    config: ConfigService,
  ) {
    const secret = config.get<string>('TICKET_QR_SECRET');
    if (!secret) throw new Error('Falta TICKET_QR_SECRET en el .env');
    this.qrSecret = secret;
  }

  private canSee(order: { sellerId: string | null }, user: AuthUser) {
    if (order.sellerId !== user.id && !VIEWERS.includes(user.role))
      throw new ForbiddenException('Esa compra es de otro vendedor');
  }

  // ---------- Pasajeros ----------

  /** Nombre, tipo e identificación de cada pasajero; recalcula precios y cupos. */
  /** Token del QR de un boleto. */
  qrFor(ticketId: string) {
    return qrToken(ticketId, this.qrSecret);
  }

  /** Id del boleto de un QR auténtico, o null. */
  ticketOfQr(token: string) {
    return verifyQrToken(token, this.qrSecret);
  }

  async setPassengers(orderId: string, dto: SetPassengersDto, user: AuthUser) {
    const order = await this.availability.ownPendingOrder(orderId, user);
    const held = order.tickets.filter((t) => t.status === TicketStatus.held);
    if (
      dto.passengers.length !== held.length ||
      !held.every((t) => dto.passengers.some((p) => p.ticketId === t.id))
    )
      throw new BadRequestException(
        'Captura un pasajero por cada asiento apartado',
      );

    const types = await this.prisma.passengerType.findMany({
      where: { id: { in: dto.passengers.map((p) => p.passengerTypeId) } },
    });
    const typeOf = (id: string) => {
      const t = types.find((x) => x.id === id);
      if (!t?.isActive)
        throw new BadRequestException('Tipo de pasajero no disponible');
      return t;
    };
    const ticketOf = (id: string) => held.find((t) => t.id === id)!;
    for (const p of dto.passengers) {
      const err = passengerError(
        {
          name: p.name,
          requiresId: typeOf(p.passengerTypeId).requiresId,
          document: p.document,
        },
        ticketOf(p.ticketId).seatNumber,
      );
      if (err) throw new BadRequestException(err);
    }

    // Cupo por recorrido de los tipos que lo tienen (INAPAM, etc.)
    const now = new Date();
    const tripId = held[0].tripId;
    for (const type of types.filter((t) => t.maxPerTrip != null)) {
      const mine = dto.passengers
        .filter((p) => p.passengerTypeId === type.id)
        .map((p) => ticketOf(p.ticketId));
      if (!mine.length) continue;
      const others = await this.prisma.ticket.findMany({
        where: {
          tripId,
          passengerTypeId: type.id,
          status: { in: ACTIVE_STATUSES },
          orderId: { not: order.id },
        },
        select: {
          seatNumber: true,
          boardIndex: true,
          alightIndex: true,
          status: true,
          order: { select: { expiresAt: true } },
        },
      });
      const segment = {
        board: mine[0].boardIndex,
        alight: mine[0].alightIndex,
      };
      const used = others.filter(
        (o) =>
          occupies({ ...o, expiresAt: o.order.expiresAt }, now) &&
          overlaps({ board: o.boardIndex, alight: o.alightIndex }, segment),
      ).length;
      const left = Math.max(0, type.maxPerTrip! - used);
      if (mine.length > left)
        throw new BadRequestException(
          left
            ? `Solo quedan ${left} lugar(es) para ${type.name} en este recorrido`
            : `Ya no hay lugares para ${type.name} en este recorrido`,
        );
    }

    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: { tripDate: true },
    });
    const [season, { tax }] = await Promise.all([
      this.availability.seasonOf(trip.tripDate),
      this.availability.pricingContext(),
    ]);
    const ordered = dto.passengers.map((p) => ({
      p,
      t: ticketOf(p.ticketId),
      type: typeOf(p.passengerTypeId),
    }));
    const prices = priceTickets(
      ordered.map(({ t, type }) => ({
        basePrice: Number(t.basePrice),
        passengerType: {
          discountPercent: Number(type.discountPercent),
          seasonTypes: type.seasonTypes,
        },
        seasonType: season?.seasonType ?? null,
      })),
      tax,
      order.channel,
    );

    await this.prisma.$transaction(async (tx) => {
      for (const [i, { p, t }] of ordered.entries())
        await tx.ticket.update({
          where: { id: t.id },
          data: {
            passengerName: p.name.trim(),
            passengerTypeId: p.passengerTypeId,
            passengerDocument: p.document ?? null,
            ...prices[i],
          },
        });
      let customerId: string | null = order.customerId;
      if (dto.contactEmail || dto.contactPhone || dto.contactName) {
        const existing = dto.contactEmail
          ? await tx.customer.findFirst({
              where: {
                email: { equals: dto.contactEmail, mode: 'insensitive' },
              },
            })
          : null;
        const data = {
          fullName: dto.contactName || dto.passengers[0].name.trim(),
          email: dto.contactEmail ?? null,
          phone: dto.contactPhone ?? null,
        };
        customerId = existing
          ? (await tx.customer.update({ where: { id: existing.id }, data })).id
          : (await tx.customer.create({ data })).id;
      }
      await tx.order.update({
        where: { id: order.id },
        data: {
          ...orderTotals(prices),
          customerId,
          contactEmail: dto.contactEmail ?? null,
          contactPhone: dto.contactPhone ?? null,
        },
      });
    });
    // Con promoción, el descuento se recalcula sobre los tipos de pasajero nuevos
    const promotionNotice = await this.promotions.reprice(order.id);
    return {
      ...(await this.availability.order(order.id, user)),
      promotionNotice,
    };
  }

  // ---------- Cobro ----------

  async pay(orderId: string, dto: PayDto, user: AuthUser) {
    const order = await this.availability.ownPendingOrder(orderId, user);
    const held = order.tickets.filter((t) => t.status === TicketStatus.held);
    if (held.some((t) => !t.passengerName))
      throw new BadRequestException('Captura a los pasajeros antes de cobrar');
    const total = Number(order.total);
    const check = checkPayments(dto.payments, total);
    if (!check.ok) throw new BadRequestException(check.error);
    // Aviso temprano; la transacción lo vuelve a revisar
    await this.cash.requireOpen(user.id, this.prisma);

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const session = await this.cash.requireOpen(user.id, tx);
      // Cierra la carrera con el vencimiento: solo se cobra si sigue pendiente y vigente
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
        },
      });
      if (claimed.count !== 1)
        throw new ConflictException(
          'El apartado venció mientras se cobraba; aparta de nuevo',
        );
      await this.promotions.consume(tx, order.id);
      const created = [];
      for (const p of dto.payments)
        created.push(
          await tx.payment.create({
            data: {
              orderId: order.id,
              method: p.method,
              status: PaymentStatus.approved,
              amount: p.amount,
              received: p.method === 'cash' ? (p.received ?? p.amount) : null,
              reference: p.reference ?? null,
              recordedById: user.id,
              cashSessionId: session.id,
              paidAt: now,
            },
          }),
        );
      await this.cash.recordSale(tx, session.id, created, user.id);
      for (const t of held) {
        await tx.ticket.update({
          where: { id: t.id },
          data: {
            status: TicketStatus.confirmed,
            qrToken: qrToken(t.id, this.qrSecret),
          },
        });
        await tx.ticketEvent.create({
          data: {
            ticketId: t.id,
            type: TicketEventType.confirmed,
            userId: user.id,
          },
        });
      }
    });
    await this.audit.log({
      userId: user.id,
      tableName: 'orders',
      recordId: order.id,
      actionType: ActionType.update,
      oldValues: { status: OrderStatus.pending },
      newValues: { status: OrderStatus.paid, total, payments: dto.payments },
    });
    // El correo no detiene la venta: si falla solo queda en el log
    if (order.contactEmail)
      void this.sendTickets(order.id, order.contactEmail).catch(
        (err: unknown) =>
          this.logger.error(
            `No se enviaron los boletos de ${order.orderNumber}`,
            err,
          ),
      );
    return {
      ...(await this.availability.order(order.id, user)),
      change: check.change,
    };
  }

  // ---------- Consulta ----------

  async list(q: QueryOrdersDto, user: AuthUser) {
    const date = q.date ?? dateKey(today());
    const from = zonedDateTime(date, '00:00');
    const to = zonedDateTime(dateKey(addDays(toDate(date), 1)), '00:00');
    const mine = q.mine || !VIEWERS.includes(user.role);
    const terms = q.search?.trim().split(/\s+/).filter(Boolean) ?? [];
    const contains = (t: string) => ({
      contains: t,
      mode: Prisma.QueryMode.insensitive,
    });
    const where: Prisma.OrderWhereInput = {
      status: { in: [OrderStatus.paid, OrderStatus.cancelled] },
      paidAt: { gte: from, lt: to },
      sellerId: mine ? user.id : undefined,
      AND: terms.map((t) => ({
        OR: [
          { orderNumber: contains(t) },
          { contactEmail: contains(t) },
          { tickets: { some: { ticketNumber: contains(t) } } },
          { tickets: { some: { passengerName: contains(t) } } },
        ],
      })),
    };
    const [data, total, sums] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          seller: { select: { id: true, fullName: true } },
          payments: { select: { method: true, amount: true } },
          tickets: {
            select: {
              id: true,
              ticketNumber: true,
              seatNumber: true,
              passengerName: true,
              status: true,
              trip: {
                select: { id: true, tripNumber: true, departureAt: true },
              },
              boardTerminal: { select: { code: true } },
              alightTerminal: { select: { code: true } },
            },
            orderBy: { seatNumber: 'asc' },
          },
        },
        orderBy: { paidAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.order.count({ where }),
      this.prisma.order.aggregate({
        where: { ...where, status: OrderStatus.paid },
        _sum: { total: true },
        _count: true,
      }),
    ]);
    return {
      ...paginate(data, total, q),
      summary: {
        date,
        orders: sums._count,
        total: Number(sums._sum.total ?? 0),
      },
    };
  }

  // ---------- Boletos ----------

  private async pdfFor(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        tickets: {
          where: {
            status: { in: [TicketStatus.confirmed, TicketStatus.checked_in] },
          },
          orderBy: { seatNumber: 'asc' },
          include: {
            passengerType: { select: { name: true } },
            boardTerminal: {
              select: {
                code: true,
                name: true,
                city: { select: { name: true, timezone: true } },
              },
            },
            alightTerminal: {
              select: {
                code: true,
                name: true,
                city: { select: { name: true, timezone: true } },
              },
            },
            trip: {
              select: {
                tripNumber: true,
                route: { select: { name: true } },
                bus: { select: { economicNumber: true } },
              },
            },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Compra no encontrada');
    if (order.status !== OrderStatus.paid || !order.tickets.length)
      throw new BadRequestException('La compra no tiene boletos pagados');

    const s = (k: Parameters<SettingsService['get']>[0]) =>
      this.settings.get(k);
    const [
      tradeName,
      legalName,
      rfc,
      address,
      phone,
      email,
      website,
      checkin,
      cancelHours,
      refund,
      logo,
    ] = await Promise.all([
      s('company.trade_name'),
      s('company.legal_name'),
      s('company.rfc'),
      s('company.address'),
      s('company.phone'),
      s('company.email'),
      s('company.website'),
      this.settings.get('tickets.checkin_minutes'),
      this.settings.get('tickets.cancellation_hours'),
      this.settings.get('tickets.refund_percent'),
      this.files.logo(),
    ]);
    const point = (
      t: {
        code: string;
        name: string;
        city: { name: string; timezone: string };
      },
      at: Date,
    ) => ({
      code: t.code,
      name: t.name,
      city: t.city.name,
      date: DATE_FMT(t.city.timezone).format(at),
      time: wallTime(at, t.city.timezone).time,
    });
    const soldAt = new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(order.paidAt ?? order.createdAt);
    const tickets: TicketPdfTicket[] = order.tickets.map((t) => ({
      ticketNumber: t.ticketNumber,
      orderNumber: order.orderNumber,
      qrToken: t.qrToken ?? '',
      passengerName: t.passengerName,
      passengerType: t.passengerType.name,
      passengerDocument: t.passengerDocument,
      seatNumber: t.seatNumber,
      tripNumber: t.trip.tripNumber,
      routeName: t.trip.route.name,
      busNumber: t.trip.bus?.economicNumber ?? null,
      board: point(t.boardTerminal, t.boardAt),
      alight: point(t.alightTerminal, t.alightAt),
      basePrice: Number(t.basePrice),
      discount: Number(t.passengerDiscount) + Number(t.promoDiscount),
      vat: Number(t.vat),
      serviceFee: Number(t.serviceFee),
      total: Number(t.total),
      soldAt,
    }));
    const buffer = await ticketsPdf(
      tickets,
      {
        name: String(tradeName || 'Central Camionera'),
        legalName: String(legalName),
        rfc: String(rfc),
        address: String(address),
        phone: String(phone),
        email: String(email),
        website: String(website),
        logo: logo
          ? { data: Buffer.from(logo.data), contentType: logo.contentType }
          : null,
      },
      {
        checkinMinutes: checkin,
        cancellationHours: cancelHours,
        refundPercent: refund,
      },
    );
    return { order, buffer, company: String(tradeName || 'Central Camionera') };
  }

  async pdf(orderId: string, user: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { sellerId: true, orderNumber: true },
    });
    if (!order) throw new NotFoundException('Compra no encontrada');
    this.canSee(order, user);
    const { buffer } = await this.pdfFor(orderId);
    return { buffer, fileName: `boletos-${order.orderNumber}.pdf` };
  }

  /** Manda los boletos en PDF al correo de la compra (o a otro). */
  async sendTickets(orderId: string, to: string) {
    const { order, buffer, company } = await this.pdfFor(orderId);
    const t = order.tickets[0];
    const html = brandedEmail({
      title: 'Tus boletos',
      intro: `Gracias por viajar con ${company}. Adjuntamos ${order.tickets.length} boleto(s) de la compra ${order.orderNumber}: ${t.boardTerminal.city.name} → ${t.alightTerminal.city.name}. Presenta el código QR al abordar.`,
    });
    await this.mail.send({
      to,
      subject: `Tus boletos ${order.orderNumber} · ${company}`,
      html,
      text: `Adjuntamos tus boletos de la compra ${order.orderNumber}. Presenta el código QR al abordar.`,
      attachments: [
        {
          filename: `boletos-${order.orderNumber}.pdf`,
          content: buffer.toString('base64'),
        },
      ],
    });
  }

  async resend(
    orderId: string,
    email: string | null | undefined,
    user: AuthUser,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { sellerId: true, contactEmail: true },
    });
    if (!order) throw new NotFoundException('Compra no encontrada');
    this.canSee(order, user);
    const to = email || order.contactEmail;
    if (!to)
      throw new BadRequestException('La compra no tiene correo; escribe uno');
    try {
      await this.sendTickets(orderId, to);
    } catch {
      throw new BadRequestException(
        'No se pudo enviar el correo; intenta más tarde',
      );
    }
    return { ok: true, to, sent: this.mail.enabled };
  }
}
