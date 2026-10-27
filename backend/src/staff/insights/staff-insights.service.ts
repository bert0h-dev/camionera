import { Injectable } from '@nestjs/common';
import { addDays, today, weekStart } from '../../common/dates.js';
import {
  AttendanceStatus,
  EvaluationStatus,
  StaffRole,
  StaffStatus,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SettingsService } from '../../settings/settings.service.js';
import {
  documentState,
  type DocumentStatus,
} from '../documents/document-status.js';
import { workedHours } from '../schedules/schedule-rules.js';

const MINUTE_MS = 60 * 1000;

/** Situación del empleado hoy, para la columna "Hoy" de la lista. */
export type TodayState =
  | 'none'
  | 'rest'
  | 'scheduled'
  | 'missing'
  | 'on_shift'
  | 'late'
  | 'done'
  | 'absent'
  | 'excused';

const SEVERITY: Record<DocumentStatus, number> = {
  valid: 0,
  expiring: 1,
  expired: 2,
};

interface DocLike {
  staffId: string;
  key: string;
  expiryDate: Date | null;
}

/**
 * Peor estado de los documentos vigentes de cada empleado. Por tipo solo cuenta
 * el de vencimiento más lejano: uno renovado reemplaza al vencido.
 */
function worstDocuments(docs: DocLike[], now: Date, alertDays: number) {
  const latest = new Map<string, DocLike>();
  for (const d of docs) {
    const k = `${d.staffId}|${d.key}`;
    const prev = latest.get(k);
    const later =
      !prev ||
      d.expiryDate === null ||
      (prev.expiryDate !== null && d.expiryDate > prev.expiryDate);
    if (later) latest.set(k, d);
  }
  const worst = new Map<
    string,
    { status: DocumentStatus; daysToExpiry: number | null }
  >();
  for (const d of latest.values()) {
    const state = documentState(d.expiryDate, now, alertDays);
    const prev = worst.get(d.staffId);
    if (
      !prev ||
      SEVERITY[state.status] > SEVERITY[prev.status] ||
      (state.status === prev.status &&
        state.daysToExpiry !== null &&
        (prev.daysToExpiry === null || state.daysToExpiry < prev.daysToExpiry))
    )
      worst.set(d.staffId, state);
  }
  return worst;
}

/** Datos derivados para la lista y la ficha de empleados (documentos, turno de hoy, resúmenes). */
@Injectable()
export class StaffInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Cifras de la banda de Empleados. */
  async stats() {
    const now = today();
    const alertDays = await this.settings.get('documents.expiry_alert_days');
    const [byStatus, withoutAccess, docs] = await Promise.all([
      this.prisma.staff.groupBy({
        by: ['status'],
        where: { status: { not: StaffStatus.inactive } },
        _count: { _all: true },
      }),
      this.prisma.staff.count({
        where: { status: { not: StaffStatus.inactive }, userId: null },
      }),
      this.docsOf({ status: { not: StaffStatus.inactive } }),
    ]);
    const count = (s: StaffStatus) =>
      byStatus.find((r) => r.status === s)?._count._all ?? 0;
    const worst = [...worstDocuments(docs, now, alertDays).values()];
    return {
      active: count(StaffStatus.active),
      away: count(StaffStatus.vacation) + count(StaffStatus.sick_leave),
      suspended: count(StaffStatus.suspended),
      withExpiredDocs: worst.filter((d) => d.status === 'expired').length,
      withExpiringDocs: worst.filter((d) => d.status === 'expiring').length,
      withoutAccess,
      alertDays,
    };
  }

  /** Agrega a cada empleado el estado de sus documentos y su situación de hoy. */
  async enrich<T extends { id: string }>(staff: T[]) {
    const ids = staff.map((s) => s.id);
    if (ids.length === 0) return [];
    const now = new Date();
    const day = today();
    const [alertDays, tolerance, docs, schedules, attendance] =
      await Promise.all([
        this.settings.get('documents.expiry_alert_days'),
        this.settings.get('attendance.late_tolerance_minutes'),
        this.docsOf({ id: { in: ids } }),
        this.prisma.staffSchedule.findMany({
          where: { staffId: { in: ids }, scheduleDate: day },
        }),
        this.prisma.staffAttendance.findMany({
          where: { staffId: { in: ids }, attendanceDate: day },
        }),
      ]);
    const worst = worstDocuments(docs, day, alertDays);
    const scheduleOf = new Map(schedules.map((s) => [s.staffId, s]));
    const attendanceOf = new Map(attendance.map((a) => [a.staffId, a]));

    return staff.map((s) => {
      const schedule = scheduleOf.get(s.id);
      const a = attendanceOf.get(s.id);
      let state: TodayState = 'none';
      if (a) {
        state =
          a.status === AttendanceStatus.absent
            ? 'absent'
            : a.status === AttendanceStatus.excused
              ? 'excused'
              : a.checkOutAt
                ? 'done'
                : a.status === AttendanceStatus.late
                  ? 'late'
                  : 'on_shift';
      } else if (schedule?.isRestDay) state = 'rest';
      else if (schedule?.startAt)
        state =
          schedule.startAt.getTime() + tolerance * MINUTE_MS < now.getTime()
            ? 'missing'
            : 'scheduled';
      return {
        ...s,
        documents: worst.get(s.id) ?? null,
        today: {
          state,
          startAt: schedule?.startAt ?? null,
          endAt: schedule?.endAt ?? null,
        },
      };
    });
  }

  /** Resumen rápido de la ficha del empleado. */
  async summary(staffId: string) {
    const staff = await this.prisma.staff.findUniqueOrThrow({
      where: { id: staffId },
      select: { id: true, role: true },
    });
    const day = today();
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1),
    );
    const monday = weekStart(day);
    const [maxWeekly, attendance, week, evaluation, licenses, next] =
      await Promise.all([
        this.settings.get('schedules.max_weekly_hours'),
        this.prisma.staffAttendance.findMany({
          where: { staffId, attendanceDate: { gte: monthStart, lte: day } },
          select: { status: true },
        }),
        this.prisma.staffSchedule.findMany({
          where: {
            staffId,
            scheduleDate: { gte: monday, lte: addDays(monday, 6) },
          },
        }),
        this.prisma.staffEvaluation.findFirst({
          where: { staffId, status: { not: EvaluationStatus.draft } },
          orderBy: { periodEnd: 'desc' },
          select: { id: true, overallScore: true, periodEnd: true },
        }),
        this.prisma.staffLicense.findMany({
          where: { staffId },
          orderBy: { expiryDate: 'desc' },
          take: 1,
        }),
        this.prisma.staffSchedule.findMany({
          where: {
            staffId,
            scheduleDate: { gte: day },
            OR: [{ endAt: { gt: now } }, { isRestDay: true }],
          },
          orderBy: { scheduleDate: 'asc' },
          take: 4,
        }),
      ]);

    // Las justificadas no cuentan en contra
    const counted = attendance.filter(
      (a) => a.status !== AttendanceStatus.excused,
    );
    const attended = counted.filter(
      (a) => a.status !== AttendanceStatus.absent,
    ).length;
    const license = licenses[0];

    return {
      attendance: {
        rate: counted.length
          ? Math.round((attended / counted.length) * 100)
          : null,
        records: attendance.length,
        absent: counted.length - attended,
      },
      week: {
        hours:
          Math.round(week.reduce((t, s) => t + workedHours(s), 0) * 10) / 10,
        max: maxWeekly,
      },
      lastEvaluation: evaluation && {
        id: evaluation.id,
        score: evaluation.overallScore,
        periodEnd: evaluation.periodEnd,
      },
      license: license
        ? {
            type: license.licenseType,
            expiryDate: license.expiryDate,
            ...documentState(license.expiryDate, day, 0),
          }
        : null,
      requiresLicense: staff.role === StaffRole.driver,
      nextShifts: next,
    };
  }

  private async docsOf(where: {
    id?: { in: string[] };
    status?: { not: StaffStatus };
  }) {
    const staffWhere = { staff: where };
    const [licenses, certs] = await Promise.all([
      this.prisma.staffLicense.findMany({
        where: staffWhere,
        select: { staffId: true, licenseType: true, expiryDate: true },
      }),
      this.prisma.staffCertification.findMany({
        where: staffWhere,
        select: { staffId: true, type: true, name: true, expiryDate: true },
      }),
    ]);
    return [
      ...licenses.map((l) => ({
        staffId: l.staffId,
        key: `L:${l.licenseType}`,
        expiryDate: l.expiryDate,
      })),
      ...certs.map((c) => ({
        staffId: c.staffId,
        key: `C:${c.type}:${c.name}`,
        expiryDate: c.expiryDate,
      })),
    ];
  }
}
