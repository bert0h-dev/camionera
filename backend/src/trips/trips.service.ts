import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { paginate } from '../common/dto/pagination.dto.js';
import { businessHour, dateKey, toDate, today } from '../common/dates.js';
import { Prisma } from '../generated/prisma/client.js';
import { ActionType, TripStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { wallTime, zonedInstant } from '../routes/route-rules.js';
import { timeKey } from '../routes/schedule-rules.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  CreateExtraTripDto,
  GenerateTripsDto,
  QueryTripsDto,
} from './dto/trip.dto.js';
import {
  addDayKey,
  plannedTrips,
  syncPlan,
  tripNumber,
  type PlanRoute,
} from './trip-rules.js';

const TABLE = 'trips';
/** Rango máximo de una generación manual */
const MAX_GENERATE_DAYS = 62;

const terminal = {
  select: {
    id: true,
    code: true,
    name: true,
    city: { select: { name: true, timezone: true } },
  },
} as const;
const person = {
  select: {
    id: true,
    employeeNumber: true,
    firstName: true,
    lastName: true,
    secondLastName: true,
  },
} as const;

const listInclude = {
  route: {
    select: {
      id: true,
      code: true,
      name: true,
      originTerminal: terminal,
      destinationTerminal: terminal,
    },
  },
  bus: { select: { id: true, economicNumber: true } },
  driver: person,
  collector: person,
} satisfies Prisma.TripInclude;

const unassignedWhere: Prisma.TripWhereInput = {
  OR: [{ busId: null }, { driverId: null }],
};

export interface GenerateResult {
  from: string;
  to: string;
  created: number;
  removed: number;
  /** Asignados que ya no coinciden con su horario */
  stale: number;
}

/**
 * Recorridos: un horario de ruta en una fecha. Se generan solos cada noche para los próximos
 * días (`trips.generation_days_ahead`) y se resincronizan al cambiar horarios o rutas.
 */
@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  // ---------- Generación ----------

  /** Rango que cubre la generación automática: de hoy a hoy + días − 1. */
  async horizon() {
    const days = await this.settings.get('trips.generation_days_ahead');
    const from = dateKey(today());
    return { from, to: addDayKey(from, days - 1) };
  }

  private async planRoutes(routeId?: string): Promise<PlanRoute[]> {
    const rows = await this.prisma.route.findMany({
      where: { id: routeId },
      select: {
        id: true,
        code: true,
        isActive: true,
        estimatedDurationMinutes: true,
        originTerminal: { select: { city: { select: { timezone: true } } } },
        schedules: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      isActive: r.isActive,
      durationMinutes: r.estimatedDurationMinutes,
      originTz: r.originTerminal.city.timezone,
      schedules: r.schedules.map((s) => ({
        id: s.id,
        departureTime: timeKey(s.departureTime),
        daysOfWeek: s.daysOfWeek,
        validFrom: dateKey(s.validFrom),
        validUntil: s.validUntil ? dateKey(s.validUntil) : null,
        isActive: s.isActive,
      })),
    }));
  }

  /** Lo que piden los horarios contra lo que existe: qué crear, qué quitar y qué avisar. */
  private async diff(from: string, to: string, routeId?: string) {
    const now = new Date();
    const routes = await this.planRoutes(routeId);
    // Las salidas que ya pasaron no se generan
    const planned = routes
      .flatMap((r) => plannedTrips(r, from, to))
      .filter((p) => p.departureAt > now);

    const existing = await this.prisma.trip.findMany({
      where: {
        routeId: { in: routes.map((r) => r.id) },
        routeScheduleId: { not: null },
        tripDate: { gte: toDate(from), lte: toDate(to) },
        departureAt: { gt: now },
      },
      select: {
        id: true,
        routeScheduleId: true,
        tripDate: true,
        departureAt: true,
        arrivalAt: true,
        status: true,
        busId: true,
        driverId: true,
        collectorId: true,
      },
    });
    const { remove, stale } = syncPlan(
      existing.map((t) => ({
        id: t.id,
        routeScheduleId: t.routeScheduleId!,
        tripDate: dateKey(t.tripDate),
        departureAt: t.departureAt,
        arrivalAt: t.arrivalAt,
        status: t.status,
        assigned: !!(t.busId || t.driverId || t.collectorId),
      })),
      planned,
    );
    return { planned, remove, stale };
  }

  /**
   * Crea los recorridos que faltan en el rango y quita los programados sin asignar que ya no
   * corresponden a su horario. Los que ya salieron no se tocan. Es idempotente.
   */
  async generate(
    from: string,
    to: string,
    routeId?: string,
  ): Promise<GenerateResult> {
    if (to < from)
      throw new BadRequestException(
        'La fecha final no puede ser anterior a la inicial',
      );
    const { planned, remove, stale } = await this.diff(from, to, routeId);
    const [removed, created] = await this.prisma.$transaction([
      this.prisma.trip.deleteMany({
        where: { id: { in: remove }, status: TripStatus.scheduled },
      }),
      // El único (horario, fecha) evita duplicados; los cancelados ocupan su lugar
      this.prisma.trip.createMany({
        data: planned.map((p) => ({ ...p, tripDate: toDate(p.tripDate) })),
        skipDuplicates: true,
      }),
    ]);
    return {
      from,
      to,
      created: created.count,
      removed: removed.count,
      stale: stale.length,
    };
  }

  /** Recorridos asignados del horizonte que ya no coinciden con su horario (para Pendientes). */
  async staleTrips() {
    const { from, to } = await this.horizon();
    const { stale } = await this.diff(from, to);
    if (!stale.length) return [];
    return this.prisma.trip.findMany({
      where: { id: { in: stale } },
      select: {
        id: true,
        tripNumber: true,
        departureAt: true,
        route: { select: { name: true } },
      },
      orderBy: { departureAt: 'asc' },
    });
  }

  /** Generación manual desde la pantalla de recorridos. */
  async generateRange(dto: GenerateTripsDto, actor: AuthUser) {
    const todayKey = dateKey(today());
    const from = dto.from < todayKey ? todayKey : dto.from;
    if (dto.to < from)
      throw new BadRequestException('El rango ya pasó; elige fechas desde hoy');
    if (addDayKey(from, MAX_GENERATE_DAYS - 1) < dto.to)
      throw new BadRequestException(
        `Se pueden generar hasta ${MAX_GENERATE_DAYS} días a la vez`,
      );
    const result = await this.generate(from, dto.to, dto.routeId);
    this.logger.log(
      `${actor.email} generó ${from}…${dto.to}: ${result.created} nuevos, ${result.removed} quitados`,
    );
    return result;
  }

  /** Vuelve a cuadrar los recorridos de una ruta dentro del horizonte (al cambiar horarios o la ruta). */
  async syncRoute(routeId: string) {
    const { from, to } = await this.horizon();
    return this.generate(from, to, routeId);
  }

  /**
   * Antes de borrar un horario: quita sus recorridos futuros sin asignar.
   * Devuelve cuántos quedan (asignados, cancelados o ya pasados); con alguno, no se puede borrar.
   */
  async releaseSchedule(routeScheduleId: string) {
    await this.prisma.trip.deleteMany({
      where: {
        routeScheduleId,
        status: TripStatus.scheduled,
        departureAt: { gt: new Date() },
        busId: null,
        driverId: null,
        collectorId: null,
      },
    });
    return this.prisma.trip.count({ where: { routeScheduleId } });
  }

  /**
   * Corre cada hora y genera a la 01:00 locales; así respeta la zona configurada sin
   * reprogramar el cron.
   */
  @Cron('15 * * * *', { name: 'trips-generate' })
  async generateIfDue() {
    if (businessHour() !== 1) return;
    try {
      const { from, to } = await this.horizon();
      const r = await this.generate(from, to);
      this.logger.log(
        `Recorridos ${from}…${to}: ${r.created} nuevos, ${r.removed} quitados, ${r.stale} por revisar`,
      );
    } catch (err) {
      this.logger.error(
        'Falló la generación de recorridos',
        err instanceof Error ? err.stack : err,
      );
    }
  }

  // ---------- Recorridos extra ----------

  async createExtra(dto: CreateExtraTripDto, actor: AuthUser) {
    const route = await this.prisma.route.findUnique({
      where: { id: dto.routeId },
      select: {
        id: true,
        code: true,
        isActive: true,
        estimatedDurationMinutes: true,
        originTerminal: { select: { city: { select: { timezone: true } } } },
      },
    });
    if (!route) throw new NotFoundException('Ruta no encontrada');
    if (!route.isActive) throw new BadRequestException('La ruta está inactiva');
    const departureAt = zonedInstant(
      dto.date,
      dto.departureTime,
      route.originTerminal.city.timezone,
    );
    if (departureAt <= new Date())
      throw new BadRequestException('La salida ya pasó');

    const prefix = tripNumber(route.code, dto.date, dto.departureTime);
    // El siguiente número después del mayor (si se borró uno, no se repite el de otro)
    const extras = await this.prisma.trip.findMany({
      where: { tripNumber: { startsWith: `${prefix}-E` } },
      select: { tripNumber: true },
    });
    const next =
      Math.max(
        0,
        ...extras.map((e) => Number(e.tripNumber.split('-E').pop())),
      ) + 1;
    const row = await this.prisma.trip.create({
      data: {
        tripNumber: tripNumber(route.code, dto.date, dto.departureTime, next),
        routeId: route.id,
        tripDate: toDate(dto.date),
        departureAt,
        arrivalAt: new Date(
          departureAt.getTime() + route.estimatedDurationMinutes * 60_000,
        ),
        durationMinutes: route.estimatedDurationMinutes,
        notes: dto.notes ?? null,
        createdById: actor.id,
        statusLog: {
          create: { toStatus: TripStatus.scheduled, changedById: actor.id },
        },
      },
    });
    await this.audit.log({
      userId: actor.id,
      tableName: TABLE,
      recordId: row.id,
      actionType: ActionType.insert,
      oldValues: null,
      newValues: row,
    });
    return row;
  }

  /** Solo un extra programado y sin asignar se puede borrar (fue un error de captura). */
  async removeExtra(id: string, actor: AuthUser) {
    const before = await this.prisma.trip.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Recorrido no encontrado');
    if (before.routeScheduleId)
      throw new BadRequestException(
        'Los recorridos de un horario no se borran; se cancelan',
      );
    if (
      before.status !== TripStatus.scheduled ||
      before.busId ||
      before.driverId ||
      before.collectorId
    )
      throw new BadRequestException(
        'Solo se puede borrar un extra programado y sin asignar; si no, cancélalo',
      );
    await this.prisma.trip.delete({ where: { id } });
    await this.audit.log({
      userId: actor.id,
      tableName: TABLE,
      recordId: id,
      actionType: ActionType.delete,
      oldValues: before,
      newValues: {},
    });
  }

  // ---------- Consulta ----------

  async findAll(q: QueryTripsDto) {
    const date = q.date ?? dateKey(today());
    const terms = q.search?.trim().split(/\s+/).filter(Boolean) ?? [];
    const contains = (t: string) => ({
      contains: t,
      mode: Prisma.QueryMode.insensitive,
    });
    const where: Prisma.TripWhereInput = {
      tripDate: toDate(date),
      routeId: q.routeId,
      status: q.status,
      AND: [
        ...(q.unassigned ? [unassignedWhere] : []),
        ...terms.map((t) => ({
          OR: [
            { tripNumber: contains(t) },
            { route: { name: contains(t) } },
            { route: { originTerminal: { city: { name: contains(t) } } } },
            { route: { destinationTerminal: { city: { name: contains(t) } } } },
          ],
        })),
      ],
    };
    const [data, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        include: listInclude,
        orderBy: [{ departureAt: 'asc' }, { tripNumber: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.trip.count({ where }),
    ]);
    return paginate(data, total, q);
  }

  /** Cifras del día para la banda de la pantalla. */
  async summary(date = dateKey(today())) {
    const where = { tripDate: toDate(date) };
    const [byStatus, unassigned, extras, horizon] = await Promise.all([
      this.prisma.trip.groupBy({ by: ['status'], where, _count: true }),
      this.prisma.trip.count({
        where: {
          ...where,
          status: { not: TripStatus.cancelled },
          ...unassignedWhere,
        },
      }),
      this.prisma.trip.count({
        where: {
          ...where,
          routeScheduleId: null,
          status: { not: TripStatus.cancelled },
        },
      }),
      this.horizon(),
    ]);
    const counts = Object.fromEntries(
      Object.values(TripStatus).map((s) => [s, 0]),
    ) as Record<TripStatus, number>;
    for (const g of byStatus) counts[g.status] = g._count;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    // Hasta qué día ya hay recorridos generados
    const last = await this.prisma.trip.aggregate({
      where: { routeScheduleId: { not: null } },
      _max: { tripDate: true },
    });
    return {
      date,
      total,
      byStatus: counts,
      unassigned,
      extras,
      horizon,
      generatedUntil: last._max.tripDate ? dateKey(last._max.tripDate) : null,
    };
  }

  async findOne(id: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        ...listInclude,
        schedule: true,
        createdBy: { select: { id: true, fullName: true } },
        cancelledBy: { select: { id: true, fullName: true } },
        statusLog: {
          orderBy: { changedAt: 'asc' },
          include: { changedBy: { select: { id: true, fullName: true } } },
        },
      },
    });
    if (!trip) throw new NotFoundException('Recorrido no encontrado');
    const { schedule, ...rest } = trip;
    const originTz = trip.route.originTerminal.city.timezone;
    const destinationTz = trip.route.destinationTerminal.city.timezone;
    return {
      ...rest,
      schedule: schedule
        ? {
            id: schedule.id,
            departureTime: timeKey(schedule.departureTime),
            daysOfWeek: schedule.daysOfWeek,
            isActive: schedule.isActive,
          }
        : null,
      // Hora de pared en el origen y en el destino, para mostrarlas sin depender de la zona de la central
      local: {
        departure: wallTime(trip.departureAt, originTz),
        arrival: wallTime(trip.arrivalAt, destinationTz),
      },
    };
  }

  /** Rutas para los filtros y el alta de extras. */
  routeOptions() {
    return this.prisma.route.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        estimatedDurationMinutes: true,
        originTerminal: terminal,
        destinationTerminal: terminal,
      },
      orderBy: { code: 'asc' },
    });
  }
}
