import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthUser } from '../../auth/auth.types.js';
import {
  addDays,
  BUSINESS_TIMEZONE,
  dateKey,
  toDate,
  today,
  zonedDateTime,
} from '../../common/dates.js';
import { Prisma, type StaffSchedule } from '../../generated/prisma/client.js';
import {
  ActionType,
  AttendanceSource,
  AttendanceStatus,
  StaffStatus,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SettingsService } from '../../settings/settings.service.js';
import { MAX_RANGE_DAYS } from '../schedules/dto/schedule.dto.js';
import { workedHours } from '../schedules/schedule-rules.js';
import { computeAttendance, type AttendanceRules } from './attendance-rules.js';
import {
  AttendanceDayDto,
  CreateAttendanceDto,
  QueryAttendanceDto,
  UpdateAttendanceDto,
} from './dto/attendance.dto.js';

const TABLE = 'staff_attendance';
const MINUTE_MS = 60 * 1000;

const staffSelect = {
  select: {
    id: true,
    employeeNumber: true,
    firstName: true,
    lastName: true,
    secondLastName: true,
    role: true,
    status: true,
  },
} satisfies Prisma.StaffDefaultArgs;

/** Fecha + hora local; si la salida es menor o igual a la entrada, es del día siguiente. */
function localTimes(
  date: string,
  checkInTime?: string | null,
  checkOutTime?: string | null,
) {
  const checkInAt = checkInTime ? zonedDateTime(date, checkInTime) : null;
  let checkOutAt = checkOutTime ? zonedDateTime(date, checkOutTime) : null;
  if (checkInAt && checkOutAt && checkOutAt <= checkInAt) {
    checkOutAt = zonedDateTime(
      dateKey(addDays(toDate(date), 1)),
      checkOutTime!,
    );
  }
  return { checkInAt, checkOutAt };
}

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  // ---------- Autoregistro del empleado ----------

  /** Turno vigente o próximo de hoy y el registro de asistencia del usuario. */
  async myToday(user: AuthUser) {
    const staff = await this.staffOfUser(user);
    const now = new Date();
    const schedule = await this.currentSchedule(staff.id, now);
    const open = await this.openAttendance(staff.id);
    const attendance =
      open ??
      (schedule
        ? await this.prisma.staffAttendance.findUnique({
            where: {
              staffId_attendanceDate: {
                staffId: staff.id,
                attendanceDate: schedule.scheduleDate,
              },
            },
          })
        : null);
    return {
      staff,
      schedule: schedule && { ...schedule, workedHours: workedHours(schedule) },
      attendance,
    };
  }

  async selfCheckIn(user: AuthUser) {
    const staff = await this.staffOfUser(user);
    if (staff.status === StaffStatus.inactive)
      throw new BadRequestException('Empleado dado de baja');
    const now = new Date();

    const schedule = await this.currentSchedule(staff.id, now);
    if (!schedule) {
      throw new BadRequestException(
        'No tienes un turno en este momento. Si estás trabajando, pide a tu supervisor que registre tu entrada.',
      );
    }
    const earlyMinutes = await this.settings.get(
      'attendance.early_check_in_minutes',
    );
    if (
      now.getTime() <
      schedule.startAt!.getTime() - earlyMinutes * MINUTE_MS
    ) {
      throw new BadRequestException(
        `Aún no puedes registrar entrada: se permite desde ${earlyMinutes} min antes de tu turno`,
      );
    }

    const existing = await this.prisma.staffAttendance.findUnique({
      where: {
        staffId_attendanceDate: {
          staffId: staff.id,
          attendanceDate: schedule.scheduleDate,
        },
      },
    });
    if (existing)
      throw new ConflictException(
        'Ya hay un registro de asistencia para este turno',
      );

    const calc = computeAttendance(schedule, now, null, await this.rules());
    const attendance = await this.prisma.staffAttendance.create({
      data: {
        staffId: staff.id,
        attendanceDate: schedule.scheduleDate,
        scheduleId: schedule.id,
        checkInAt: now,
        ...calc,
        source: AttendanceSource.self,
        recordedById: user.id,
      },
    });
    await this.log(user.id, attendance.id, ActionType.insert, null, attendance);
    return attendance;
  }

  async selfCheckOut(user: AuthUser) {
    const staff = await this.staffOfUser(user);
    const open = await this.openAttendance(staff.id);
    if (!open)
      throw new BadRequestException(
        'No tienes una entrada abierta para registrar salida',
      );

    const now = new Date();
    const calc = computeAttendance(
      open.schedule,
      open.checkInAt!,
      now,
      await this.rules(),
    );
    const attendance = await this.prisma.staffAttendance.update({
      where: { id: open.id },
      data: { checkOutAt: now, ...calc },
    });
    await this.log(user.id, attendance.id, ActionType.update, open, attendance);
    return attendance;
  }

  // ---------- Captura y corrección por supervisión ----------

  async create(dto: CreateAttendanceDto, actor: AuthUser) {
    const staff = await this.prisma.staff.findUniqueOrThrow({
      where: { id: dto.staffId },
    });
    if (staff.status === StaffStatus.inactive)
      throw new BadRequestException('Empleado dado de baja');
    const attendanceDate = toDate(dto.date);
    if (attendanceDate > today())
      throw new BadRequestException('No se puede registrar asistencia futura');

    const schedule = await this.prisma.staffSchedule.findUnique({
      where: {
        staffId_scheduleDate: {
          staffId: dto.staffId,
          scheduleDate: attendanceDate,
        },
      },
    });
    const data = await this.buildRecord(dto.date, schedule, dto);

    try {
      const attendance = await this.prisma.staffAttendance.create({
        data: {
          staffId: dto.staffId,
          attendanceDate,
          scheduleId: schedule?.id ?? null,
          ...data,
          source: AttendanceSource.manual,
          recordedById: actor.id,
          notes: dto.notes,
        },
      });
      await this.log(
        actor.id,
        attendance.id,
        ActionType.insert,
        null,
        attendance,
      );
      return attendance;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ya existe un registro de ese día; corrígelo en lugar de crear otro',
        );
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateAttendanceDto, actor: AuthUser) {
    const before = await this.prisma.staffAttendance.findUniqueOrThrow({
      where: { id },
      include: { schedule: true },
    });
    const date = dateKey(before.attendanceDate);

    // Lo que no se envía conserva su valor actual (en hora local)
    const current = (d: Date | null) =>
      d
        ? new Intl.DateTimeFormat('en-GB', {
            timeZone: BUSINESS_TIMEZONE,
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
          }).format(d)
        : null;
    const merged = {
      checkInTime:
        dto.checkInTime === undefined
          ? current(before.checkInAt)
          : dto.checkInTime,
      checkOutTime:
        dto.checkOutTime === undefined
          ? current(before.checkOutAt)
          : dto.checkOutTime,
      // Si se capturan horas sobre una justificada, deja de serlo
      excused:
        dto.excused ??
        (before.status === AttendanceStatus.excused &&
          dto.checkInTime === undefined &&
          dto.checkOutTime === undefined),
    };
    const data = await this.buildRecord(date, before.schedule, merged);

    const attendance = await this.prisma.staffAttendance.update({
      where: { id },
      data: {
        ...data,
        source: AttendanceSource.manual,
        recordedById: actor.id,
        notes: before.notes ? `${before.notes}\n${dto.notes}` : dto.notes,
      },
    });
    await this.log(actor.id, id, ActionType.update, before, attendance);
    return attendance;
  }

  /** Arma horas y cálculo de un registro capturado a mano. */
  private async buildRecord(
    date: string,
    schedule: StaffSchedule | null,
    input: {
      checkInTime?: string | null;
      checkOutTime?: string | null;
      excused?: boolean;
    },
  ) {
    if (input.excused) {
      return {
        checkInAt: null,
        checkOutAt: null,
        status: AttendanceStatus.excused,
        lateMinutes: 0,
        workedMinutes: 0,
        overtimeMinutes: 0,
      };
    }
    const { checkInAt, checkOutAt } = localTimes(
      date,
      input.checkInTime,
      input.checkOutTime,
    );
    if (!checkInAt) {
      if (checkOutAt)
        throw new BadRequestException('No puede haber salida sin entrada');
      return {
        checkInAt: null,
        checkOutAt: null,
        status: AttendanceStatus.absent,
        lateMinutes: 0,
        workedMinutes: 0,
        overtimeMinutes: 0,
      };
    }
    if (checkInAt > new Date() || (checkOutAt && checkOutAt > new Date())) {
      throw new BadRequestException('No se pueden registrar horas futuras');
    }
    return {
      checkInAt,
      checkOutAt,
      ...computeAttendance(schedule, checkInAt, checkOutAt, await this.rules()),
    };
  }

  // ---------- Consultas ----------

  async findAll(query: QueryAttendanceDto) {
    const from = toDate(query.from);
    const to = toDate(query.to);
    this.assertRange(from, to);
    return this.prisma.staffAttendance.findMany({
      where: {
        attendanceDate: { gte: from, lte: to },
        staffId: query.staffId,
        status: query.status,
        staff: query.role ? { role: query.role } : undefined,
      },
      include: { staff: staffSelect, schedule: true },
      orderBy: [{ attendanceDate: 'desc' }, { checkInAt: 'asc' }],
    });
  }

  /** Quién tenía turno ese día y qué registró, más quien registró sin turno. */
  async day(query: AttendanceDayDto) {
    const date = toDate(query.date);
    const staffFilter = query.role ? { role: query.role } : undefined;
    const [schedules, records] = await Promise.all([
      this.prisma.staffSchedule.findMany({
        where: { scheduleDate: date, staff: staffFilter },
        include: { staff: staffSelect },
      }),
      this.prisma.staffAttendance.findMany({
        where: { attendanceDate: date, staff: staffFilter },
        include: { staff: staffSelect },
      }),
    ]);

    const recordByStaff = new Map(records.map((r) => [r.staffId, r]));
    const rows = schedules.map((s) => {
      const { staff, ...schedule } = s;
      return {
        staff,
        schedule: { ...schedule, workedHours: workedHours(schedule) },
        attendance: recordByStaff.get(s.staffId) ?? null,
      };
    });
    const unscheduled = records
      .filter((r) => !schedules.some((s) => s.staffId === r.staffId))
      .map(({ staff, ...attendance }) => ({
        staff,
        schedule: null,
        attendance,
      }));

    return [...rows, ...unscheduled].sort(
      (a, b) =>
        (a.schedule?.startAt?.getTime() ?? Infinity) -
          (b.schedule?.startAt?.getTime() ?? Infinity) ||
        a.staff.lastName.localeCompare(b.staff.lastName),
    );
  }

  /** Resumen por empleado para nómina y reportes. */
  async summary(query: QueryAttendanceDto) {
    const records = await this.findAll(query);
    const byStaff = new Map<
      string,
      {
        staff: (typeof records)[number]['staff'];
        present: number;
        late: number;
        halfDay: number;
        absent: number;
        excused: number;
        lateMinutes: number;
        workedMinutes: number;
        overtimeMinutes: number;
      }
    >();
    for (const r of records) {
      const row = byStaff.get(r.staffId) ?? {
        staff: r.staff,
        present: 0,
        late: 0,
        halfDay: 0,
        absent: 0,
        excused: 0,
        lateMinutes: 0,
        workedMinutes: 0,
        overtimeMinutes: 0,
      };
      if (r.status === AttendanceStatus.present) row.present++;
      if (r.status === AttendanceStatus.late) row.late++;
      if (r.status === AttendanceStatus.half_day) row.halfDay++;
      if (r.status === AttendanceStatus.absent) row.absent++;
      if (r.status === AttendanceStatus.excused) row.excused++;
      row.lateMinutes += r.lateMinutes;
      row.workedMinutes += r.workedMinutes;
      row.overtimeMinutes += r.overtimeMinutes;
      byStaff.set(r.staffId, row);
    }
    return [...byStaff.values()].sort((a, b) =>
      a.staff.lastName.localeCompare(b.staff.lastName),
    );
  }

  // ---------- Cierre del día ----------

  /**
   * Marca falta (o falta justificada si estaba de vacaciones/incapacidad) a quien tenía turno
   * y no registró nada. Solo días ya terminados.
   */
  async closeDay(date: string, actorId: string | null) {
    const day = toDate(date);
    if (day >= today())
      throw new BadRequestException(
        'Solo se pueden cerrar días anteriores a hoy',
      );

    const pending = await this.prisma.staffSchedule.findMany({
      where: {
        scheduleDate: day,
        isRestDay: false,
        staff: {
          status: { not: StaffStatus.inactive },
          // Sin ningún registro ese día (ligado o no al turno)
          attendance: { none: { attendanceDate: day } },
        },
      },
      include: { staff: { select: { status: true } } },
    });

    let absent = 0;
    let excused = 0;
    for (const s of pending) {
      const isExcused =
        s.staff.status === StaffStatus.vacation ||
        s.staff.status === StaffStatus.sick_leave;
      const attendance = await this.prisma.staffAttendance.create({
        data: {
          staffId: s.staffId,
          attendanceDate: day,
          scheduleId: s.id,
          status: isExcused
            ? AttendanceStatus.excused
            : AttendanceStatus.absent,
          source: AttendanceSource.system,
          recordedById: actorId,
          notes: isExcused
            ? `Justificada automáticamente (${s.staff.status === StaffStatus.vacation ? 'vacaciones' : 'incapacidad'})`
            : 'Falta registrada en el cierre del día',
        },
      });
      await this.log(
        actorId,
        attendance.id,
        ActionType.insert,
        null,
        attendance,
      );
      if (isExcused) excused++;
      else absent++;
    }
    return { date, absent, excused };
  }

  /** Todos los días a las 02:00 (hora de la central) se cierra el día anterior. */
  @Cron('0 2 * * *', {
    timeZone: BUSINESS_TIMEZONE,
    name: 'attendance-close-day',
  })
  async closeYesterday() {
    const yesterday = dateKey(addDays(today(), -1));
    try {
      const result = await this.closeDay(yesterday, null);
      this.logger.log(
        `Cierre de ${yesterday}: ${result.absent} faltas, ${result.excused} justificadas`,
      );
    } catch (err) {
      this.logger.error(
        `Falló el cierre de ${yesterday}`,
        err instanceof Error ? err.stack : err,
      );
    }
  }

  // ---------- Internos ----------

  private async rules(): Promise<AttendanceRules> {
    const [lateToleranceMinutes, halfDayPercent, overtimeThresholdMinutes] =
      await Promise.all([
        this.settings.get('attendance.late_tolerance_minutes'),
        this.settings.get('attendance.half_day_percent'),
        this.settings.get('attendance.overtime_threshold_minutes'),
      ]);
    return { lateToleranceMinutes, halfDayPercent, overtimeThresholdMinutes };
  }

  private async staffOfUser(user: AuthUser) {
    const staff = await this.prisma.staff.findUnique({
      where: { userId: user.id },
    });
    if (!staff)
      throw new NotFoundException('Tu usuario no está ligado a un empleado');
    return staff;
  }

  /**
   * Turno en curso o el próximo que se puede checar: no descanso, que aún no termine,
   * de ayer (nocturno) u hoy. El más cercano a iniciar.
   */
  private async currentSchedule(staffId: string, now: Date) {
    const day = today();
    return this.prisma.staffSchedule.findFirst({
      where: {
        staffId,
        isRestDay: false,
        scheduleDate: { gte: addDays(day, -1), lte: day },
        endAt: { gt: now },
      },
      orderBy: { startAt: 'asc' },
    });
  }

  /** Registro con entrada y sin salida de ayer u hoy (los más viejos los corrige supervisión). */
  private openAttendance(staffId: string) {
    return this.prisma.staffAttendance.findFirst({
      where: {
        staffId,
        checkInAt: { not: null },
        checkOutAt: null,
        attendanceDate: { gte: addDays(today(), -1) },
      },
      include: { schedule: true },
      orderBy: { checkInAt: 'desc' },
    });
  }

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

  private log(
    userId: string | null,
    recordId: string,
    actionType: ActionType,
    oldValues: object | null,
    newValues: object | null,
  ) {
    return this.audit.log({
      userId: userId ?? undefined,
      tableName: TABLE,
      recordId,
      actionType,
      oldValues,
      newValues,
    });
  }
}
