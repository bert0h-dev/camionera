import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { paginate, PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  ActionType,
  OrderStatus,
  TicketStatus,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateCustomerDto } from './dto/customer.dto.js';
import { fromCents, toCents } from './money.js';

/** Clientes (quien compra): búsqueda, ficha con su historial y edición de datos. */
@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: PaginationQueryDto) {
    const terms = q.search?.trim().split(/\s+/).filter(Boolean) ?? [];
    const contains = (t: string) => ({
      contains: t,
      mode: Prisma.QueryMode.insensitive,
    });
    const where: Prisma.CustomerWhereInput = {
      AND: terms.map((t) => ({
        OR: [
          { fullName: contains(t) },
          { email: contains(t) },
          { phone: contains(t) },
        ],
      })),
    };
    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        include: {
          _count: {
            select: {
              orders: {
                where: {
                  status: { in: [OrderStatus.paid, OrderStatus.cancelled] },
                },
              },
            },
          },
          orders: {
            where: { status: OrderStatus.paid },
            select: { paidAt: true },
            orderBy: { paidAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return paginate(
      data.map(({ orders, ...c }) => ({
        ...c,
        lastPurchaseAt: orders[0]?.paidAt ?? null,
      })),
      total,
      q,
    );
  }

  /** Ficha: datos, compras con sus boletos y cifras (viajes, gasto, cancelados, no presentados). */
  async detail(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        orders: {
          where: { status: { in: [OrderStatus.paid, OrderStatus.cancelled] } },
          orderBy: { paidAt: 'desc' },
          include: {
            payments: { select: { amount: true } },
            refunds: { select: { amount: true } },
            tickets: {
              where: { status: { notIn: [TicketStatus.held] } },
              orderBy: { seatNumber: 'asc' },
              select: {
                id: true,
                ticketNumber: true,
                seatNumber: true,
                passengerName: true,
                status: true,
                boardAt: true,
                total: true,
                boardTerminal: { select: { code: true } },
                alightTerminal: { select: { code: true } },
                trip: { select: { id: true, tripNumber: true } },
              },
            },
          },
        },
      },
    });
    if (!customer) throw new NotFoundException('Cliente no encontrado');
    const tickets = customer.orders.flatMap((o) => o.tickets);
    const count = (s: TicketStatus) =>
      tickets.filter((t) => t.status === s).length;
    const sum = (xs: { amount: Prisma.Decimal }[]) =>
      xs.reduce((a, x) => a + toCents(Number(x.amount)), 0);
    const spent = customer.orders.reduce(
      (a, o) => a + sum(o.payments) - sum(o.refunds),
      0,
    );
    const traveled = tickets
      .filter((t) => t.status === TicketStatus.checked_in)
      .map((t) => t.boardAt);
    return {
      ...customer,
      stats: {
        orders: customer.orders.length,
        tickets: tickets.length,
        boarded: count(TicketStatus.checked_in),
        upcoming: count(TicketStatus.confirmed),
        cancelled: count(TicketStatus.cancelled),
        noShow: count(TicketStatus.no_show),
        spent: fromCents(spent),
        lastTripAt: traveled.length
          ? new Date(Math.max(...traveled.map((d) => d.getTime())))
          : null,
      },
    };
  }

  async update(id: string, dto: UpdateCustomerDto, actor: AuthUser) {
    const before = await this.prisma.customer.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Cliente no encontrado');
    const row = await this.prisma.customer.update({ where: { id }, data: dto });
    await this.audit.log({
      userId: actor.id,
      tableName: 'customers',
      recordId: id,
      actionType: ActionType.update,
      oldValues: before,
      newValues: row,
    });
    return row;
  }
}
