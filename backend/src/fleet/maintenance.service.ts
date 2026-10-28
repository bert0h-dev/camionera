import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { toDate, today } from '../common/dates.js';
import { paginate } from '../common/dto/pagination.dto.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  ActionType,
  BusStatus,
  MaintenanceStatus,
  MaintenanceType,
  OdometerSource,
  UserRole,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { BusesService } from './buses.service.js';
import {
  AddTaskDto,
  CancelOrderDto,
  CompleteOrderDto,
  CreateMaintenanceOrderDto,
  QueryMaintenanceDto,
  StartOrderDto,
  TaskTemplateDto,
  UpdateMaintenanceOrderDto,
  UpdateTaskTemplateDto,
} from './dto/maintenance.dto.js';
import { nextService } from './maintenance-rules.js';

const TABLE = 'maintenance_orders';
const OPEN: MaintenanceStatus[] = [
  MaintenanceStatus.scheduled,
  MaintenanceStatus.in_progress,
];

const orderInclude = {
  bus: {
    select: {
      id: true,
      economicNumber: true,
      plates: true,
      status: true,
      odometerKm: true,
    },
  },
  mechanic: { select: { id: true, fullName: true } },
  tasks: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.MaintenanceOrderInclude;

const isMechanic = (actor: AuthUser) => actor.role === UserRole.mechanic;

/** Total de la orden: mano de obra + refacciones. */
const totalOf = (o: {
  laborCost: Prisma.Decimal | null;
  partsCost: Prisma.Decimal | null;
}) => Number(o.laborCost ?? 0) + Number(o.partsCost ?? 0);

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly buses: BusesService,
  ) {}

  private log(
    actor: AuthUser,
    recordId: string,
    actionType: ActionType,
    before: object | null,
    after: object,
  ) {
    return this.audit.log({
      userId: actor.id,
      tableName: TABLE,
      recordId,
      actionType,
      oldValues: before,
      newValues: after,
    });
  }

  /** El mecánico solo ve y trabaja sus órdenes o las que no tienen mecánico asignado. */
  private mechanicScope(actor: AuthUser): Prisma.MaintenanceOrderWhereInput {
    return isMechanic(actor)
      ? { OR: [{ mechanicId: actor.id }, { mechanicId: null }] }
      : {};
  }

  private async getOrder(id: string, actor: AuthUser) {
    const order = await this.prisma.maintenanceOrder.findFirst({
      where: { id, ...this.mechanicScope(actor) },
      include: orderInclude,
    });
    if (!order) throw new ForbiddenException('No tienes acceso a esta orden');
    return order;
  }

  private async assertMechanic(id: string | null | undefined) {
    if (!id) return;
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || !user.isActive || user.role !== UserRole.mechanic)
      throw new BadRequestException(
        'El mecánico asignado debe ser un usuario activo con rol mecánico',
      );
  }

  // ---------- Plan preventivo ----------

  private async thresholds() {
    const [days, km] = await Promise.all([
      this.settings.get('fleet.maintenance_alert_days'),
      this.settings.get('fleet.maintenance_alert_km'),
    ]);
    return { days, km };
  }

  /** Próximo preventivo de cada unidad activa, con su orden preventiva abierta si la hay. */
  async plan(busId?: string) {
    const [buses, alert] = await Promise.all([
      this.prisma.bus.findMany({
        where: {
          id: busId,
          status: busId ? undefined : { not: BusStatus.out_of_service },
        },
        include: {
          busModel: {
            select: {
              brand: true,
              model: true,
              preventiveKm: true,
              preventiveDays: true,
            },
          },
          terminal: { select: { code: true } },
          readings: {
            orderBy: { recordedAt: 'asc' },
            take: 1,
            select: { km: true },
          },
          maintenanceOrders: {
            where: { type: MaintenanceType.preventive, status: { in: OPEN } },
            select: {
              id: true,
              folio: true,
              status: true,
              scheduledDate: true,
            },
            take: 1,
          },
        },
        orderBy: { economicNumber: 'asc' },
      }),
      this.thresholds(),
    ]);
    const now = today();
    const rank = { overdue: 0, due_soon: 1, ok: 2, no_plan: 3 };
    return buses
      .map((b) => {
        // Sin preventivo previo se cuenta desde el alta de la unidad
        const base = {
          date: b.lastServiceAt ?? b.createdAt,
          km: b.lastServiceKm ?? b.readings[0]?.km ?? 0,
        };
        const plan = {
          km: b.preventiveKm ?? b.busModel.preventiveKm,
          days: b.preventiveDays ?? b.busModel.preventiveDays,
        };
        return {
          bus: {
            id: b.id,
            economicNumber: b.economicNumber,
            plates: b.plates,
            status: b.status,
            odometerKm: b.odometerKm,
            model: `${b.busModel.brand} ${b.busModel.model}`,
            terminal: b.terminal.code,
          },
          plan,
          lastServiceAt: b.lastServiceAt,
          lastServiceKm: b.lastServiceKm,
          openOrder: b.maintenanceOrders[0] ?? null,
          ...nextService(plan, base, b.odometerKm, now, alert.days, alert.km),
        };
      })
      .sort(
        (a, b) =>
          rank[a.status] - rank[b.status] ||
          (a.daysLeft ?? 0) - (b.daysLeft ?? 0),
      );
  }

  async summary(actor: AuthUser) {
    const monthStart = new Date(
      Date.UTC(today().getUTCFullYear(), today().getUTCMonth(), 1),
    );
    const [plan, inProgress, scheduled, completed] = await Promise.all([
      isMechanic(actor) ? Promise.resolve([]) : this.plan(),
      this.prisma.maintenanceOrder.count({
        where: {
          status: MaintenanceStatus.in_progress,
          ...this.mechanicScope(actor),
        },
      }),
      this.prisma.maintenanceOrder.count({
        where: {
          status: MaintenanceStatus.scheduled,
          ...this.mechanicScope(actor),
        },
      }),
      this.prisma.maintenanceOrder.findMany({
        where: {
          status: MaintenanceStatus.completed,
          completedAt: { gte: monthStart },
        },
        select: { laborCost: true, partsCost: true },
      }),
    ]);
    return {
      overdue: plan.filter((p) => p.status === 'overdue').length,
      dueSoon: plan.filter((p) => p.status === 'due_soon').length,
      inProgress,
      scheduled,
      completedThisMonth: completed.length,
      costThisMonth: completed.reduce((sum, o) => sum + totalOf(o), 0),
    };
  }

  // ---------- Órdenes ----------

  async findAll(q: QueryMaintenanceDto, actor: AuthUser) {
    const term = q.search?.trim().replace(/^OT-?/i, '');
    const folio = term && /^\d+$/.test(term) ? Number(term) : undefined;
    const where: Prisma.MaintenanceOrderWhereInput = {
      status: q.status,
      type: q.type,
      busId: q.busId,
      ...this.mechanicScope(actor),
      ...(q.search && {
        AND: [
          {
            OR: [
              ...(folio ? [{ folio }] : []),
              {
                bus: {
                  economicNumber: {
                    contains: q.search.trim(),
                    mode: 'insensitive' as const,
                  },
                },
              },
              {
                description: {
                  contains: q.search.trim(),
                  mode: 'insensitive' as const,
                },
              },
            ],
          },
        ],
      }),
    };
    const [data, total] = await Promise.all([
      this.prisma.maintenanceOrder.findMany({
        where,
        include: { ...orderInclude, tasks: { select: { isDone: true } } },
        orderBy: [
          { status: 'asc' },
          { scheduledDate: 'asc' },
          { folio: 'desc' },
        ],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.maintenanceOrder.count({ where }),
    ]);
    return paginate(
      data.map(({ tasks, ...o }) => ({
        ...o,
        tasksDone: tasks.filter((t) => t.isDone).length,
        tasksTotal: tasks.length,
        total: totalOf(o),
      })),
      total,
      q,
    );
  }

  async findOne(id: string, actor: AuthUser) {
    const order = await this.getOrder(id, actor);
    return { ...order, total: totalOf(order) };
  }

  /** Usuarios con rol mecánico para asignar. */
  mechanics() {
    return this.prisma.user.findMany({
      where: { role: UserRole.mechanic, isActive: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
  }

  async create(dto: CreateMaintenanceOrderDto, actor: AuthUser) {
    const bus = await this.prisma.bus.findUniqueOrThrow({
      where: { id: dto.busId },
    });
    if (bus.status === BusStatus.out_of_service)
      throw new BadRequestException('La unidad está fuera de servicio');
    await this.assertMechanic(dto.mechanicId);
    if (dto.type === MaintenanceType.preventive) {
      const open = await this.prisma.maintenanceOrder.findFirst({
        where: {
          busId: dto.busId,
          type: MaintenanceType.preventive,
          status: { in: OPEN },
        },
      });
      if (open)
        throw new BadRequestException(
          `La unidad ya tiene un preventivo abierto (OT-${open.folio})`,
        );
    }

    // Los preventivos sin tareas propias toman las del catálogo
    let tasks = dto.tasks?.map((t) => t.trim()).filter(Boolean) ?? [];
    if (!tasks.length && dto.type === MaintenanceType.preventive)
      tasks = (
        await this.prisma.maintenanceTaskTemplate.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        })
      ).map((t) => t.description);

    const { tasks: _t, scheduledDate, ...data } = dto;
    const order = await this.prisma.maintenanceOrder.create({
      data: {
        ...data,
        scheduledDate: toDate(scheduledDate),
        createdBy: actor.id,
        tasks: {
          create: tasks.map((description, i) => ({
            description,
            sortOrder: (i + 1) * 10,
          })),
        },
      },
      include: orderInclude,
    });
    await this.log(actor, order.id, ActionType.insert, null, {
      ...order,
      tasks: tasks.length,
    });
    return order;
  }

  async update(id: string, dto: UpdateMaintenanceOrderDto, actor: AuthUser) {
    const before = await this.getOrder(id, actor);
    if (!OPEN.includes(before.status))
      throw new BadRequestException('La orden ya está cerrada');
    await this.assertMechanic(dto.mechanicId);
    const { scheduledDate, ...rest } = dto;
    const order = await this.prisma.maintenanceOrder.update({
      where: { id },
      data: {
        ...rest,
        ...(scheduledDate && { scheduledDate: toDate(scheduledDate) }),
      },
      include: orderInclude,
    });
    await this.log(
      actor,
      id,
      ActionType.update,
      { ...before, tasks: undefined },
      { ...order, tasks: undefined },
    );
    return order;
  }

  /** Inicia el trabajo: la unidad pasa a mantenimiento y se registra el odómetro de entrada. */
  async start(id: string, dto: StartOrderDto, actor: AuthUser) {
    const order = await this.getOrder(id, actor);
    if (order.status !== MaintenanceStatus.scheduled)
      throw new BadRequestException('Solo se inician órdenes programadas');
    const bus = await this.prisma.bus.findUniqueOrThrow({
      where: { id: order.busId },
    });
    if (bus.status === BusStatus.in_service)
      throw new BadRequestException(
        'La unidad está en servicio; espera a que regrese para iniciar',
      );
    if (bus.status === BusStatus.out_of_service)
      throw new BadRequestException('La unidad está fuera de servicio');

    await this.buses.recordOdometer(
      bus.id,
      dto.km,
      actor,
      OdometerSource.maintenance,
    );
    const now = new Date();
    const [updated] = await this.prisma.$transaction([
      this.prisma.maintenanceOrder.update({
        where: { id },
        data: {
          status: MaintenanceStatus.in_progress,
          startedAt: now,
          startKm: dto.km,
          // El mecánico que inicia una orden sin asignar se la queda
          ...(isMechanic(actor) &&
            !order.mechanicId && { mechanicId: actor.id }),
        },
        include: orderInclude,
      }),
      this.prisma.bus.update({
        where: { id: bus.id },
        data: {
          status: BusStatus.maintenance,
          statusReason: `OT-${order.folio}: ${order.description}`,
          statusChangedAt: now,
        },
      }),
    ]);
    await this.log(
      actor,
      id,
      ActionType.update,
      { status: order.status },
      { status: updated.status, startKm: dto.km },
    );
    await this.audit.log({
      userId: actor.id,
      tableName: 'buses',
      recordId: bus.id,
      actionType: ActionType.update,
      oldValues: { status: bus.status, statusReason: bus.statusReason },
      newValues: {
        status: BusStatus.maintenance,
        statusReason: `OT-${order.folio}: ${order.description}`,
      },
    });
    return updated;
  }

  /** Termina el trabajo; la unidad vuelve a disponible si no le queda otra orden en proceso. */
  async complete(id: string, dto: CompleteOrderDto, actor: AuthUser) {
    const order = await this.getOrder(id, actor);
    if (order.status !== MaintenanceStatus.in_progress)
      throw new BadRequestException('Solo se terminan órdenes en proceso');
    if (order.startKm !== null && dto.km < order.startKm)
      throw new BadRequestException(
        'El odómetro de salida no puede ser menor al de entrada',
      );

    await this.buses.recordOdometer(
      order.busId,
      dto.km,
      actor,
      OdometerSource.maintenance,
    );
    const now = new Date();
    const updated = await this.prisma.maintenanceOrder.update({
      where: { id },
      data: {
        status: MaintenanceStatus.completed,
        completedAt: now,
        endKm: dto.km,
        workPerformed: dto.workPerformed,
        laborCost: dto.laborCost ?? 0,
        partsCost: dto.partsCost ?? 0,
      },
      include: orderInclude,
    });
    // Solo el preventivo reinicia el conteo del próximo servicio
    if (order.type === MaintenanceType.preventive)
      await this.prisma.bus.update({
        where: { id: order.busId },
        data: { lastServiceAt: now, lastServiceKm: dto.km },
      });
    await this.releaseBus(order.busId, id, actor);
    await this.log(
      actor,
      id,
      ActionType.update,
      { status: order.status },
      {
        status: updated.status,
        endKm: dto.km,
        laborCost: dto.laborCost ?? 0,
        partsCost: dto.partsCost ?? 0,
      },
    );
    return updated;
  }

  async cancel(id: string, dto: CancelOrderDto, actor: AuthUser) {
    const order = await this.getOrder(id, actor);
    if (!OPEN.includes(order.status))
      throw new BadRequestException('La orden ya está cerrada');
    const updated = await this.prisma.maintenanceOrder.update({
      where: { id },
      data: { status: MaintenanceStatus.cancelled, cancelReason: dto.reason },
      include: orderInclude,
    });
    if (order.status === MaintenanceStatus.in_progress)
      await this.releaseBus(order.busId, id, actor);
    await this.log(
      actor,
      id,
      ActionType.update,
      { status: order.status },
      { status: updated.status, cancelReason: dto.reason },
    );
    return updated;
  }

  /** Regresa la unidad a disponible si sigue en mantenimiento y no tiene otra orden en proceso. */
  private async releaseBus(
    busId: string,
    closedOrderId: string,
    actor: AuthUser,
  ) {
    const [bus, other] = await Promise.all([
      this.prisma.bus.findUniqueOrThrow({ where: { id: busId } }),
      this.prisma.maintenanceOrder.count({
        where: {
          busId,
          status: MaintenanceStatus.in_progress,
          id: { not: closedOrderId },
        },
      }),
    ]);
    if (bus.status !== BusStatus.maintenance || other > 0) return;
    await this.prisma.bus.update({
      where: { id: busId },
      data: {
        status: BusStatus.available,
        statusReason: null,
        statusChangedAt: new Date(),
      },
    });
    await this.audit.log({
      userId: actor.id,
      tableName: 'buses',
      recordId: busId,
      actionType: ActionType.update,
      oldValues: { status: bus.status, statusReason: bus.statusReason },
      newValues: { status: BusStatus.available, statusReason: null },
    });
  }

  // ---------- Tareas ----------

  async toggleTask(
    orderId: string,
    taskId: string,
    isDone: boolean,
    actor: AuthUser,
  ) {
    const order = await this.getOrder(orderId, actor);
    if (order.status !== MaintenanceStatus.in_progress)
      throw new BadRequestException(
        'Las tareas se marcan con la orden en proceso',
      );
    await this.prisma.maintenanceTask.findFirstOrThrow({
      where: { id: taskId, orderId },
    });
    return this.prisma.maintenanceTask.update({
      where: { id: taskId },
      data: { isDone, doneAt: isDone ? new Date() : null },
    });
  }

  async addTask(orderId: string, dto: AddTaskDto, actor: AuthUser) {
    const order = await this.getOrder(orderId, actor);
    if (!OPEN.includes(order.status))
      throw new BadRequestException('La orden ya está cerrada');
    const last = order.tasks.at(-1)?.sortOrder ?? 0;
    return this.prisma.maintenanceTask.create({
      data: { orderId, description: dto.description, sortOrder: last + 10 },
    });
  }

  // ---------- Catálogo de tareas base ----------

  templates(includeInactive = false) {
    return this.prisma.maintenanceTaskTemplate.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { description: 'asc' }],
    });
  }

  async createTemplate(dto: TaskTemplateDto, actor: AuthUser) {
    const last = await this.prisma.maintenanceTaskTemplate.aggregate({
      _max: { sortOrder: true },
    });
    const row = await this.prisma.maintenanceTaskTemplate.create({
      data: {
        ...dto,
        sortOrder: dto.sortOrder ?? (last._max.sortOrder ?? 0) + 10,
      },
    });
    await this.audit.log({
      userId: actor.id,
      tableName: 'maintenance_task_templates',
      recordId: row.id,
      actionType: ActionType.insert,
      newValues: row,
    });
    return row;
  }

  async updateTemplate(
    id: string,
    dto: UpdateTaskTemplateDto,
    actor: AuthUser,
  ) {
    const before = await this.prisma.maintenanceTaskTemplate.findUniqueOrThrow({
      where: { id },
    });
    const row = await this.prisma.maintenanceTaskTemplate.update({
      where: { id },
      data: dto,
    });
    await this.audit.log({
      userId: actor.id,
      tableName: 'maintenance_task_templates',
      recordId: id,
      actionType: ActionType.update,
      oldValues: before,
      newValues: row,
    });
    return row;
  }
}
