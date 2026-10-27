import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthUser } from '../../auth/auth.types.js';
import {
  addDays,
  dateKey,
  toDate,
  weekStart,
  zonedDateTime,
} from '../../common/dates.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  ActionType,
  ShiftType,
  StaffStatus,
  UserRole,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SettingsService } from '../../settings/settings.service.js';
import {
  BulkScheduleDto,
  CreateScheduleDto,
  MAX_RANGE_DAYS,
  QuerySchedulesDto,
  UpdateScheduleDto,
} from './dto/schedule.dto.js';
import {
  validateSchedule,
  workedHours,
  type ScheduleLike,
  type ScheduleLimits,
} from './schedule-rules.js';

const TABLE = 'staff_schedules';

const staffSelect = {
  select: {
    id: true,
    employeeNumber: true,
    firstName: true,
    lastName: true,
    secondLastName: true,
    role: true,
  },
} satisfies Prisma.StaffDefaultArgs;

type ShiftInput = Omit<UpdateScheduleDto, 'force' | 'overrideReason'>;

/** Datos calculados de un turno listo para guardar. */
interface ResolvedShift {
  startAt: Date | null;
  endAt: Date | null;
  shiftType: ShiftType | null;
  breakMinutes: number;
  isRestDay: boolean;
  templateId: string | null;
  notes: string | null | undefined;
}

const withHours = <T extends Parameters<typeof workedHours>[0]>(s: T) => ({
  ...s,
  workedHours: workedHours(s),
});

@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  async findAll(query: QuerySchedulesDto) {
    const from = toDate(query.from);
    const to = toDate(query.to);
    this.assertRange(from, to);

    const schedules = await this.prisma.staffSchedule.findMany({
      where: {
        scheduleDate: { gte: from, lte: to },
        staffId: query.staffId,
        staff: query.role ? { role: query.role } : undefined,
      },
      include: {
        staff: staffSelect,
        template: { select: { id: true, name: true } },
      },
      orderBy: [{ scheduleDate: 'asc' }, { startAt: 'asc' }],
    });
    return schedules.map(withHours);
  }

  async create(dto: CreateScheduleDto, actor: AuthUser) {
    const {
      staffId,
      scheduleDate: date,
      force,
      overrideReason,
      ...shift
    } = dto;
    await this.assertSchedulable(staffId);
    const scheduleDate = toDate(date);
    const resolved = await this.resolveShift(date, shift);
    const override = await this.checkRules(
      staffId,
      scheduleDate,
      resolved,
      actor,
      force,
      overrideReason,
    );

    try {
      const schedule = await this.prisma.staffSchedule.create({
        data: {
          ...resolved,
          staffId,
          scheduleDate,
          overrideReason: override,
          createdById: actor.id,
        },
        include: { staff: staffSelect },
      });
      await this.log(actor, schedule.id, ActionType.insert, null, schedule);
      return withHours(schedule);
    } catch (err) {
      throw this.duplicateDay(err);
    }
  }

  async update(id: string, dto: UpdateScheduleDto, actor: AuthUser) {
    const before = await this.prisma.staffSchedule.findUniqueOrThrow({
      where: { id },
    });
    await this.assertSchedulable(before.staffId);
    const { force, overrideReason, ...shift } = dto;
    const resolved = await this.resolveShift(
      dateKey(before.scheduleDate),
      shift,
    );
    const override = await this.checkRules(
      before.staffId,
      before.scheduleDate,
      resolved,
      actor,
      force,
      overrideReason,
      id,
    );

    const schedule = await this.prisma.staffSchedule.update({
      where: { id },
      data: { ...resolved, overrideReason: override },
      include: { staff: staffSelect },
    });
    await this.log(actor, id, ActionType.update, before, schedule);
    return withHours(schedule);
  }

  async remove(id: string, actor: AuthUser) {
    const before = await this.prisma.staffSchedule.findUniqueOrThrow({
      where: { id },
    });
    await this.prisma.staffSchedule.delete({ where: { id } });
    await this.log(actor, id, ActionType.delete, before, null);
  }

  /**
   * Programa varios empleados en un rango de fechas. Los turnos válidos se guardan;
   * los que rompen reglas o ya existen se devuelven en `skipped` con el motivo.
   */
  async bulk(dto: BulkScheduleDto, actor: AuthUser) {
    const {
      staffIds,
      from: fromKey,
      to: toKey,
      weekdays,
      replace,
      ...shift
    } = dto;
    const from = toDate(fromKey);
    const to = toDate(toKey);
    this.assertRange(from, to);

    const staffList = await this.prisma.staff.findMany({
      where: { id: { in: staffIds } },
      select: { id: true, status: true },
    });
    const limits = await this.limits();

    const dates: Date[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (weekdays.includes(d.getUTCDay())) dates.push(d);
    }

    const created: string[] = [];
    const skipped: { staffId: string; date: string; reason: string }[] = [];

    for (const staff of staffList) {
      if (staff.status === StaffStatus.inactive) {
        dates.forEach((d) =>
          skipped.push({
            staffId: staff.id,
            date: dateKey(d),
            reason: 'Empleado dado de baja',
          }),
        );
        continue;
      }
      for (const date of dates) {
        const key = dateKey(date);
        const resolved = await this.resolveShift(key, shift);
        const existing = await this.prisma.staffSchedule.findUnique({
          where: {
            staffId_scheduleDate: { staffId: staff.id, scheduleDate: date },
          },
        });
        if (existing && !replace) {
          skipped.push({
            staffId: staff.id,
            date: key,
            reason: 'Ya tiene turno ese día',
          });
          continue;
        }

        const others = await this.neighbors(staff.id, date, existing?.id);
        const violations = validateSchedule(
          { ...resolved, scheduleDate: date },
          others,
          limits,
        );
        if (violations.length) {
          skipped.push({
            staffId: staff.id,
            date: key,
            reason: violations.join('; '),
          });
          continue;
        }

        const schedule = existing
          ? await this.prisma.staffSchedule.update({
              where: { id: existing.id },
              data: { ...resolved, overrideReason: null },
            })
          : await this.prisma.staffSchedule.create({
              data: {
                ...resolved,
                staffId: staff.id,
                scheduleDate: date,
                createdById: actor.id,
              },
            });
        await this.log(
          actor,
          schedule.id,
          existing ? ActionType.update : ActionType.insert,
          existing,
          schedule,
        );
        created.push(schedule.id);
      }
    }

    const notFound = staffIds.filter(
      (id) => !staffList.some((s) => s.id === id),
    );
    notFound.forEach((id) =>
      skipped.push({
        staffId: id,
        date: fromKey,
        reason: 'Empleado no encontrado',
      }),
    );

    return { created: created.length, skipped };
  }

  /** ¿El empleado tiene un turno que cubre por completo [from, to]? Lo usará el Módulo 4. */
  async isOnShift(staffId: string, from: Date, to: Date) {
    const shift = await this.prisma.staffSchedule.findFirst({
      where: {
        staffId,
        isRestDay: false,
        startAt: { lte: from },
        endAt: { gte: to },
      },
    });
    return !!shift;
  }

  // ---------- Internos ----------

  private assertRange(from: Date, to: Date) {
    if (to < from)
      throw new BadRequestException(
        'La fecha final debe ser igual o posterior a la inicial',
      );
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
      throw new BadRequestException(
        `El rango máximo es de ${MAX_RANGE_DAYS} días`,
      );
    }
  }

  private async assertSchedulable(staffId: string) {
    const staff = await this.prisma.staff.findUniqueOrThrow({
      where: { id: staffId },
    });
    if (staff.status === StaffStatus.inactive) {
      throw new BadRequestException(
        'No se pueden programar turnos a un empleado dado de baja',
      );
    }
  }

  private async limits(): Promise<ScheduleLimits> {
    const [maxShiftHours, minRestHours, maxWeeklyHours] = await Promise.all([
      this.settings.get('schedules.max_shift_hours'),
      this.settings.get('schedules.min_rest_hours'),
      this.settings.get('schedules.max_weekly_hours'),
    ]);
    return { maxShiftHours, minRestHours, maxWeeklyHours };
  }

  /** Convierte plantilla / horas locales / descanso en los campos a guardar. */
  private async resolveShift(
    date: string,
    input: ShiftInput,
  ): Promise<ResolvedShift> {
    if (input.isRestDay) {
      return {
        startAt: null,
        endAt: null,
        shiftType: null,
        breakMinutes: 0,
        isRestDay: true,
        templateId: null,
        notes: input.notes,
      };
    }

    let { startTime, endTime, shiftType, breakMinutes } = input;
    if (input.templateId) {
      const template = await this.prisma.shiftTemplate.findUniqueOrThrow({
        where: { id: input.templateId },
      });
      startTime = template.startTime;
      endTime = template.endTime;
      shiftType = template.shiftType;
      breakMinutes ??= template.breakMinutes;
    }
    if (!startTime || !endTime || !shiftType) {
      throw new BadRequestException(
        'Indica una plantilla, o bien hora de inicio, hora de fin y tipo de turno',
      );
    }

    const startAt = zonedDateTime(date, startTime);
    // Fin igual o menor que el inicio = termina al día siguiente
    const endDate =
      endTime <= startTime ? dateKey(addDays(toDate(date), 1)) : date;
    return {
      startAt,
      endAt: zonedDateTime(endDate, endTime),
      shiftType,
      breakMinutes: breakMinutes ?? 0,
      isRestDay: false,
      templateId: input.templateId ?? null,
      notes: input.notes,
    };
  }

  /** Turnos del empleado en la semana del día y los días vecinos (para descansos entre semanas). */
  private neighbors(
    staffId: string,
    date: Date,
    excludeId?: string,
  ): Promise<ScheduleLike[]> {
    const monday = weekStart(date);
    return this.prisma.staffSchedule.findMany({
      where: {
        staffId,
        id: excludeId ? { not: excludeId } : undefined,
        scheduleDate: { gte: addDays(monday, -2), lte: addDays(monday, 8) },
      },
    });
  }

  /**
   * Aplica las reglas de horas. Si hay violaciones solo un admin puede forzar, con motivo.
   * Devuelve el motivo del forzado a guardar (o null).
   */
  private async checkRules(
    staffId: string,
    scheduleDate: Date,
    resolved: ResolvedShift,
    actor: AuthUser,
    force?: boolean,
    overrideReason?: string | null,
    excludeId?: string,
  ) {
    const violations = validateSchedule(
      { ...resolved, scheduleDate },
      await this.neighbors(staffId, scheduleDate, excludeId),
      await this.limits(),
    );
    if (!violations.length) return null;

    if (!force) throw new BadRequestException(violations);
    if (actor.role !== UserRole.admin) {
      throw new ForbiddenException(
        'Solo un administrador puede forzar un turno que rompe las reglas de horas',
      );
    }
    if (!overrideReason)
      throw new BadRequestException('Indica el motivo para forzar el turno');
    return `${overrideReason} [Reglas omitidas: ${violations.join('; ')}]`;
  }

  private duplicateDay(err: unknown) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return new ConflictException(
        'El empleado ya tiene un turno programado ese día',
      );
    }
    return err;
  }

  private log(
    actor: AuthUser,
    recordId: string,
    actionType: ActionType,
    oldValues: object | null,
    newValues: object | null,
  ) {
    return this.audit.log({
      userId: actor.id,
      tableName: TABLE,
      recordId,
      actionType,
      oldValues,
      newValues,
    });
  }
}
