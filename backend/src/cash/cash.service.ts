import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { paginate } from '../common/dto/pagination.dto.js';
import { addDays, dateKey, toDate, zonedDateTime } from '../common/dates.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  ActionType,
  CashMovementType,
  CashSessionStatus,
  OrderStatus,
  PaymentMethod,
  TicketStatus,
  UserRole,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  cashTotals,
  closeCheck,
  commission,
  countBreakdown,
  withdrawalError,
} from './cash-rules.js';
import { cashReportPdf } from './cash-pdf.js';
import {
  CashMovementDto,
  CloseCashDto,
  OpenCashDto,
  QueryCashDto,
} from './dto/cash.dto.js';

/** Supervisión: ve todas las cajas y puede cerrar la de otro. */
export const CASH_SUPERVISORS: UserRole[] = [
  UserRole.admin,
  UserRole.supervisor,
];

const sessionInclude = {
  user: { select: { id: true, fullName: true } },
  closedBy: { select: { id: true, fullName: true } },
  terminal: { select: { id: true, code: true, name: true } },
} satisfies Prisma.CashSessionInclude;

/** Caja de cada vendedor: apertura, movimientos, corte con arqueo y comisión. */
@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /** Caja abierta del usuario o null. */
  openSessionOf(userId: string, tx: Prisma.TransactionClient = this.prisma) {
    return tx.cashSession.findFirst({
      where: { userId, status: CashSessionStatus.open },
    });
  }

  /** Para cobrar: exige caja abierta (decisión del M6, para todos los que cobran). */
  async requireOpen(userId: string, tx: Prisma.TransactionClient) {
    const s = await this.openSessionOf(userId, tx);
    if (!s)
      throw new BadRequestException(
        'Abre tu caja antes de cobrar (Venta › Caja)',
      );
    return s;
  }

  /** Registra los pagos de una venta como movimientos de la caja (dentro de la transacción del cobro). */
  async recordSale(
    tx: Prisma.TransactionClient,
    sessionId: string,
    payments: {
      id: string;
      method: PaymentMethod;
      amount: Prisma.Decimal | number;
    }[],
    userId: string,
  ) {
    await tx.cashMovement.createMany({
      data: payments.map((p) => ({
        sessionId,
        type: CashMovementType.sale,
        method: p.method,
        amount: p.amount,
        paymentId: p.id,
        createdById: userId,
      })),
    });
  }

  /** Registra un reembolso como salida de la caja (dentro de la transacción de la cancelación o el cambio). */
  async recordRefund(
    tx: Prisma.TransactionClient,
    sessionId: string,
    refund: { id: string; method: PaymentMethod; amount: number },
    userId: string,
  ) {
    await tx.cashMovement.create({
      data: {
        sessionId,
        type: CashMovementType.refund,
        method: refund.method,
        amount: refund.amount,
        refundId: refund.id,
        createdById: userId,
      },
    });
  }

  /** Para devolver efectivo: no puede salir más del que hay en la caja. */
  async checkCashOut(
    session: { id: string; openingFloat: Prisma.Decimal },
    amount: number,
  ) {
    const { totals } = await this.totalsOf(session);
    const err = withdrawalError(totals.expectedCash, amount);
    if (err) throw new BadRequestException(err);
  }

  async totalsOf(session: { id: string; openingFloat: Prisma.Decimal }) {
    const [movements, orders, tickets] = await Promise.all([
      this.prisma.cashMovement.findMany({
        where: { sessionId: session.id },
        select: { type: true, method: true, amount: true },
      }),
      this.prisma.order.count({
        where: { cashSessionId: session.id, status: OrderStatus.paid },
      }),
      this.prisma.ticket.count({
        where: {
          order: { cashSessionId: session.id },
          status: { notIn: [TicketStatus.held, TicketStatus.cancelled] },
        },
      }),
    ]);
    const totals = cashTotals(
      Number(session.openingFloat),
      movements.map((m) => ({ ...m, amount: Number(m.amount) })),
    );
    return { totals, orders, tickets };
  }

  private canSee(session: { userId: string }, user: AuthUser) {
    if (session.userId !== user.id && !CASH_SUPERVISORS.includes(user.role))
      throw new ForbiddenException('Esa caja es de otro vendedor');
  }

  /** Detalle de una caja: totales al momento (o los congelados si ya se cortó) y movimientos. */
  async detail(id: string, user: AuthUser) {
    const session = await this.prisma.cashSession.findUnique({
      where: { id },
      include: {
        ...sessionInclude,
        movements: {
          orderBy: { createdAt: 'desc' },
          include: { createdBy: { select: { fullName: true } } },
        },
      },
    });
    if (!session) throw new NotFoundException('Caja no encontrada');
    this.canSee(session, user);
    const live = await this.totalsOf(session);
    const percent = await this.settings.get('commissions.vendor_percent');
    // Los pagos de cada movimiento de venta, para mostrar el folio de la compra
    const payments = await this.prisma.payment.findMany({
      where: {
        id: {
          in: session.movements.flatMap((m) =>
            m.paymentId ? [m.paymentId] : [],
          ),
        },
      },
      select: { id: true, order: { select: { id: true, orderNumber: true } } },
    });
    return {
      ...session,
      movements: session.movements.map((m) => ({
        ...m,
        order: payments.find((p) => p.id === m.paymentId)?.order ?? null,
      })),
      live: {
        ...live,
        commissionPercent: percent,
        commission: commission(live.totals.netSales, percent),
      },
    };
  }

  async current(user: AuthUser) {
    const s = await this.openSessionOf(user.id);
    const [defaultFloat, tolerance] = await Promise.all([
      this.settings.get('cash.default_float'),
      this.settings.get('cash.difference_tolerance'),
    ]);
    return {
      session: s ? await this.detail(s.id, user) : null,
      defaultFloat,
      tolerance,
    };
  }

  async open(dto: OpenCashDto, user: AuthUser) {
    try {
      const row = await this.prisma.cashSession.create({
        data: {
          userId: user.id,
          openingFloat: dto.openingFloat,
          terminalId: dto.terminalId ?? null,
        },
      });
      await this.audit.log({
        userId: user.id,
        tableName: 'cash_sessions',
        recordId: row.id,
        actionType: ActionType.insert,
        oldValues: null,
        newValues: row,
      });
      return this.detail(row.id, user);
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes('cash_sessions_one_open_per_user')
      )
        throw new ConflictException('Ya tienes una caja abierta');
      throw err;
    }
  }

  /** Retiro o ingreso de efectivo en la caja propia. */
  async movement(dto: CashMovementDto, user: AuthUser) {
    const s = await this.openSessionOf(user.id);
    if (!s) throw new BadRequestException('No tienes una caja abierta');
    if (dto.type === 'withdrawal') {
      const { totals } = await this.totalsOf(s);
      const err = withdrawalError(totals.expectedCash, dto.amount);
      if (err) throw new BadRequestException(err);
    }
    await this.prisma.cashMovement.create({
      data: {
        sessionId: s.id,
        type: dto.type as CashMovementType,
        method: PaymentMethod.cash,
        amount: dto.amount,
        reason: dto.reason,
        createdById: user.id,
      },
    });
    return this.detail(s.id, user);
  }

  /** Corte: congela totales, conteo, diferencia y comisión. El dueño o supervisión pueden cerrarla. */
  async close(id: string, dto: CloseCashDto, user: AuthUser) {
    const s = await this.prisma.cashSession.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Caja no encontrada');
    this.canSee(s, user);
    if (s.status !== CashSessionStatus.open)
      throw new BadRequestException('La caja ya tiene corte');

    let counted = dto.countedCash;
    if (dto.breakdown && Object.keys(dto.breakdown).length) {
      const b = countBreakdown(dto.breakdown);
      if (!b.ok) throw new BadRequestException(b.error);
      counted = b.total;
    }
    if (counted == null)
      throw new BadRequestException('Captura el efectivo contado');

    const [{ totals, orders, tickets }, tolerance, percent] = await Promise.all(
      [
        this.totalsOf(s),
        this.settings.get('cash.difference_tolerance'),
        this.settings.get('commissions.vendor_percent'),
      ],
    );
    const check = closeCheck(
      totals.expectedCash,
      counted,
      tolerance,
      dto.notes,
    );
    if (check.error) throw new BadRequestException(check.error);
    const amount = commission(totals.netSales, percent);

    const now = new Date();
    const closed = await this.prisma.cashSession.updateMany({
      where: { id, status: CashSessionStatus.open },
      data: {
        status: CashSessionStatus.closed,
        closedAt: now,
        closedById: user.id,
        expectedCash: totals.expectedCash,
        countedCash: counted,
        difference: check.difference,
        closingNotes: dto.notes ?? null,
        commissionPercent: percent,
        commissionAmount: amount,
        summary: {
          totals,
          orders,
          tickets,
          breakdown: dto.breakdown ?? null,
          tolerance,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    if (closed.count !== 1)
      throw new ConflictException('Otra persona hizo el corte al mismo tiempo');
    await this.audit.log({
      userId: user.id,
      tableName: 'cash_sessions',
      recordId: id,
      actionType: ActionType.update,
      oldValues: { status: CashSessionStatus.open },
      newValues: {
        status: CashSessionStatus.closed,
        expectedCash: totals.expectedCash,
        countedCash: counted,
        difference: check.difference,
        byOther: s.userId !== user.id,
      },
    });
    return this.detail(id, user);
  }

  async list(q: QueryCashDto, user: AuthUser) {
    const all = CASH_SUPERVISORS.includes(user.role);
    const where: Prisma.CashSessionWhereInput = {
      userId: all ? q.userId : user.id,
      status: q.status,
      ...(q.date
        ? {
            openedAt: {
              gte: zonedDateTime(q.date, '00:00'),
              lt: zonedDateTime(dateKey(addDays(toDate(q.date), 1)), '00:00'),
            },
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.cashSession.findMany({
        where,
        include: sessionInclude,
        orderBy: [{ status: 'desc' }, { openedAt: 'desc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.cashSession.count({ where }),
    ]);
    return paginate(data, total, q);
  }

  /** Reporte del corte para firmar y entregar con el efectivo. */
  async pdf(id: string, user: AuthUser) {
    const d = await this.detail(id, user);
    const company = await this.settings.get('company.trade_name');
    const buffer = await cashReportPdf(
      d,
      String(company || 'Central Camionera'),
    );
    return {
      buffer,
      fileName: `corte-${d.user.fullName.replace(/\s+/g, '-')}-${dateKey(d.openedAt)}.pdf`,
    };
  }

  // ---------- Pendientes de supervisión ----------

  /** Cajas abiertas por más de `cash.max_open_hours`. */
  async openTooLong() {
    const hours = await this.settings.get('cash.max_open_hours');
    return this.prisma.cashSession.findMany({
      where: {
        status: CashSessionStatus.open,
        openedAt: { lt: new Date(Date.now() - hours * 3_600_000) },
      },
      include: sessionInclude,
      orderBy: { openedAt: 'asc' },
    });
  }

  /** Cortes de los últimos 7 días con diferencia fuera de la tolerancia. */
  async recentDifferences() {
    const tolerance = await this.settings.get('cash.difference_tolerance');
    const rows = await this.prisma.cashSession.findMany({
      where: {
        status: CashSessionStatus.closed,
        closedAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
        difference: { not: 0 },
      },
      include: sessionInclude,
      orderBy: { closedAt: 'desc' },
    });
    return rows.filter((r) => Math.abs(Number(r.difference)) > tolerance);
  }
}
