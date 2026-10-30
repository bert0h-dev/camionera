import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { addDays, dateKey, toDate, today } from '../common/dates.js';
import type { RouteSchedule } from '../generated/prisma/client.js';
import { Prisma } from '../generated/prisma/client.js';
import { ActionType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { TripsService } from '../trips/trips.service.js';
import { CreateSchedulesDto, UpdateScheduleDto } from './dto/schedule.dto.js';
import { localArrival, wallTime } from './route-rules.js';
import {
  daysLabel,
  findClash,
  normalizeDays,
  scheduleStatus,
  timeKey,
  timeValue,
  validityError,
  type ScheduleWindow,
} from './schedule-rules.js';

const TABLE = 'route_schedules';

/** Fila de la base → ventana con fechas y hora como texto. */
const toWindow = (s: RouteSchedule): ScheduleWindow & { id: string } => ({
  id: s.id,
  departureTime: timeKey(s.departureTime),
  daysOfWeek: s.daysOfWeek,
  validFrom: dateKey(s.validFrom),
  validUntil: s.validUntil ? dateKey(s.validUntil) : null,
  isActive: s.isActive,
});

/** Horarios que cuentan hoy: activos y dentro de su vigencia. */
export function currentSchedulesWhere(
  on = today(),
): Prisma.RouteScheduleWhereInput {
  return {
    isActive: true,
    validFrom: { lte: on },
    OR: [{ validUntil: null }, { validUntil: { gte: on } }],
  };
}

const clashMessage = (time: string, other: ScheduleWindow) =>
  `Ya hay una salida a las ${time} (${daysLabel(other.daysOfWeek)}) vigente desde ${other.validFrom}${
    other.validUntil ? ` hasta ${other.validUntil}` : ''
  } que coincide en días y fechas`;

@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly trips: TripsService,
  ) {}

  private route(routeId: string) {
    return this.prisma.route.findUniqueOrThrow({
      where: { id: routeId },
      select: {
        id: true,
        isActive: true,
        estimatedDurationMinutes: true,
        originTerminal: { select: { city: { select: { timezone: true } } } },
        destinationTerminal: {
          select: { city: { select: { timezone: true } } },
        },
      },
    });
  }

  /** Horarios de la ruta con su situación y la llegada en hora local del destino. */
  async list(routeId: string) {
    const route = await this.route(routeId);
    const originTz = route.originTerminal.city.timezone;
    const destinationTz = route.destinationTerminal.city.timezone;
    const todayKey = wallTime(new Date(), originTz).date;
    const rows = await this.prisma.routeSchedule.findMany({
      where: { routeId },
      orderBy: [{ departureTime: 'asc' }, { validFrom: 'asc' }],
    });
    return rows.map((s) => {
      const w = toWindow(s);
      // La llegada se calcula en una fecha en que el horario aplica, para tomar el horario de verano correcto
      const reference = w.validFrom > todayKey ? w.validFrom : todayKey;
      const arrival = localArrival(
        reference,
        w.departureTime,
        originTz,
        route.estimatedDurationMinutes,
        destinationTz,
      );
      return {
        ...w,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        status: scheduleStatus(w, todayKey),
        arrivalTime: arrival.time,
        arrivalDayOffset: arrival.dayOffset,
      };
    });
  }

  private async assertNoClash(
    routeId: string,
    candidates: ScheduleWindow[],
    excludeId?: string,
  ) {
    const existing = (
      await this.prisma.routeSchedule.findMany({
        where: {
          routeId,
          isActive: true,
          id: excludeId ? { not: excludeId } : undefined,
        },
      })
    ).map(toWindow);
    for (const c of candidates) {
      const other = findClash(c, existing);
      if (other)
        throw new BadRequestException(clashMessage(c.departureTime, other));
    }
  }

  async create(routeId: string, dto: CreateSchedulesDto, actor: AuthUser) {
    await this.route(routeId);
    const validUntil = dto.validUntil ?? null;
    const err = validityError(dto.validFrom, validUntil);
    if (err) throw new BadRequestException(err);
    const daysOfWeek = normalizeDays(dto.daysOfWeek);
    const candidates = [...dto.departureTimes].sort().map((departureTime) => ({
      departureTime,
      daysOfWeek,
      validFrom: dto.validFrom,
      validUntil,
      isActive: true,
    }));
    await this.assertNoClash(routeId, candidates);

    const rows = await this.prisma.$transaction(
      candidates.map((c) =>
        this.prisma.routeSchedule.create({
          data: {
            routeId,
            departureTime: timeValue(c.departureTime),
            daysOfWeek,
            validFrom: toDate(c.validFrom),
            validUntil: validUntil ? toDate(validUntil) : null,
          },
        }),
      ),
    );
    for (const row of rows)
      await this.audit.log({
        userId: actor.id,
        tableName: TABLE,
        recordId: row.id,
        actionType: ActionType.insert,
        oldValues: null,
        newValues: row,
      });
    await this.trips.syncRoute(routeId);
    return rows.map(toWindow);
  }

  private async own(routeId: string, id: string) {
    return this.prisma.routeSchedule.findFirstOrThrow({
      where: { id, routeId },
    });
  }

  async update(
    routeId: string,
    id: string,
    dto: UpdateScheduleDto,
    actor: AuthUser,
  ) {
    const before = await this.own(routeId, id);
    const current = toWindow(before);
    const next: ScheduleWindow = {
      id,
      departureTime: dto.departureTime ?? current.departureTime,
      daysOfWeek: dto.daysOfWeek
        ? normalizeDays(dto.daysOfWeek)
        : current.daysOfWeek,
      validFrom: dto.validFrom ?? current.validFrom,
      validUntil:
        dto.validUntil === undefined ? current.validUntil : dto.validUntil,
      isActive: dto.isActive ?? current.isActive,
    };
    const err = validityError(next.validFrom, next.validUntil);
    if (err) throw new BadRequestException(err);
    await this.assertNoClash(routeId, [next], id);

    const row = await this.prisma.routeSchedule.update({
      where: { id },
      data: {
        departureTime: timeValue(next.departureTime),
        daysOfWeek: next.daysOfWeek,
        validFrom: toDate(next.validFrom),
        validUntil: next.validUntil ? toDate(next.validUntil) : null,
        isActive: next.isActive,
      },
    });
    await this.audit.log({
      userId: actor.id,
      tableName: TABLE,
      recordId: id,
      actionType: ActionType.update,
      oldValues: before,
      newValues: row,
    });
    await this.trips.syncRoute(routeId);
    return toWindow(row);
  }

  async remove(routeId: string, id: string, actor: AuthUser) {
    const before = await this.own(routeId, id);
    // Sus recorridos futuros sin asignar se van con él; si le quedan otros, solo se puede desactivar
    const left = await this.trips.releaseSchedule(id);
    if (left)
      throw new BadRequestException(
        `El horario ya tiene ${left} recorrido(s) asignados, cancelados o realizados; desactívalo en lugar de borrarlo`,
      );
    await this.prisma.routeSchedule.delete({ where: { id } });
    await this.audit.log({
      userId: actor.id,
      tableName: TABLE,
      recordId: id,
      actionType: ActionType.delete,
      oldValues: before,
      newValues: {},
    });
  }

  // ---------- Para Inicio y la banda de rutas ----------

  /** Salidas por semana de las rutas activas con horarios vigentes hoy. */
  async weeklyDepartures() {
    const rows = await this.prisma.routeSchedule.findMany({
      where: { ...currentSchedulesWhere(), route: { isActive: true } },
      select: { daysOfWeek: true },
    });
    return rows.reduce((n, s) => n + s.daysOfWeek.length, 0);
  }

  /** Rutas activas que hoy no tienen ningún horario vigente. */
  routesWithoutSchedules() {
    return this.prisma.route.findMany({
      where: {
        isActive: true,
        schedules: { none: currentSchedulesWhere() },
      },
      select: {
        id: true,
        code: true,
        name: true,
        updatedAt: true,
        // Para distinguir "sin horarios" de "solo tiene horarios futuros o vencidos"
        schedules: {
          where: { isActive: true, validFrom: { gt: today() } },
          select: { validFrom: true },
          orderBy: { validFrom: 'asc' },
          take: 1,
        },
      },
      orderBy: { code: 'asc' },
    });
  }

  /** Horarios vigentes de rutas activas cuya vigencia termina dentro del aviso. */
  async expiringSchedules() {
    const days = await this.settings.get('routes.schedule_expiry_alert_days');
    const now = today();
    return this.prisma.routeSchedule.findMany({
      where: {
        ...currentSchedulesWhere(now),
        validUntil: { gte: now, lte: addDays(now, days) },
        route: { isActive: true },
      },
      include: { route: { select: { id: true, code: true, name: true } } },
      orderBy: { validUntil: 'asc' },
    });
  }
}
