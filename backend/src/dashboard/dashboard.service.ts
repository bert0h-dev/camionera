import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { addDays, dateKey, today } from '../common/dates.js';
import {
  AttendanceStatus,
  EvaluationStatus,
  StaffStatus,
  UserRole,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { StaffDocumentsService } from '../staff/documents/staff-documents.service.js';
import { HomePreferencesDto } from './dto/home-preferences.dto.js';

const MINUTE_MS = 60 * 1000;
const TREND_DAYS = 7;
const TEAM_READERS: UserRole[] = [
  UserRole.admin,
  UserRole.hr,
  UserRole.supervisor,
  UserRole.coordinator,
];

/** Situación de cada turno de hoy en el tablero de entradas. */
type BoardState =
  'missing' | 'scheduled' | 'on_time' | 'late' | 'done' | 'absent' | 'excused';

type StatusCounts = Record<AttendanceStatus, number>;

const emptyCounts = (): StatusCounts => ({
  present: 0,
  late: 0,
  half_day: 0,
  absent: 0,
  excused: 0,
});

/** Indicadores de la pantalla de Inicio: del equipo (lectores de personal) y propios. */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly documents: StaffDocumentsService,
  ) {}

  /** Secciones de Inicio que el usuario ocultó; se guardan en `users.preferences.home`. */
  async homePreferences(userId: string): Promise<HomePreferencesDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { preferences: true },
    });
    const home = (user.preferences as { home?: Partial<HomePreferencesDto> })
      .home;
    return { hiddenSections: home?.hiddenSections ?? [] };
  }

  async saveHomePreferences(userId: string, dto: HomePreferencesDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { preferences: true },
    });
    const preferences = {
      ...(user.preferences as object),
      home: { hiddenSections: [...new Set(dto.hiddenSections)] },
    };
    await this.prisma.user.update({
      where: { id: userId },
      data: { preferences },
    });
    return preferences.home;
  }

  async summary(user: AuthUser) {
    const [team, me] = await Promise.all([
      TEAM_READERS.includes(user.role) ? this.team() : null,
      this.me(user),
    ]);
    return { team, me };
  }

  private async team() {
    const now = new Date();
    const day = today();
    const trendFrom = addDays(day, -(TREND_DAYS - 1));
    const tolerance = await this.settings.get(
      'attendance.late_tolerance_minutes',
    );

    const [
      byStatus,
      byRole,
      schedulesToday,
      attendanceToday,
      trendRows,
      expirations,
      evaluations,
    ] = await Promise.all([
      this.prisma.staff.groupBy({
        by: ['status'],
        where: { status: { not: StaffStatus.inactive } },
        _count: { _all: true },
      }),
      this.prisma.staff.groupBy({
        by: ['role'],
        where: { status: StaffStatus.active },
        _count: { _all: true },
      }),
      this.prisma.staffSchedule.findMany({
        where: {
          scheduleDate: day,
          isRestDay: false,
          staff: { status: { not: StaffStatus.inactive } },
        },
        select: {
          staffId: true,
          startAt: true,
          endAt: true,
          staff: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              secondLastName: true,
              role: true,
            },
          },
        },
      }),
      this.prisma.staffAttendance.findMany({
        where: { attendanceDate: day },
        select: {
          staffId: true,
          status: true,
          checkInAt: true,
          checkOutAt: true,
          lateMinutes: true,
        },
      }),
      this.prisma.staffAttendance.groupBy({
        by: ['attendanceDate', 'status'],
        where: { attendanceDate: { gte: trendFrom, lte: day } },
        _count: { _all: true },
      }),
      this.documents.expirations(),
      this.prisma.staffEvaluation.groupBy({
        by: ['status'],
        where: {
          status: { in: [EvaluationStatus.draft, EvaluationStatus.finalized] },
        },
        _count: { _all: true },
      }),
    ]);

    const staffStatus = Object.fromEntries(
      byStatus.map((r) => [r.status, r._count._all]),
    ) as Partial<Record<StaffStatus, number>>;

    // Hoy: quién tiene turno, quién está trabajando y quién debió llegar y no ha checado
    const recorded = new Map(attendanceToday.map((a) => [a.staffId, a]));
    const onShiftNow = schedulesToday.filter(
      (s) => s.startAt! <= now && now < s.endAt!,
    ).length;
    const working = attendanceToday.filter(
      (a) =>
        !a.checkOutAt &&
        a.status !== AttendanceStatus.absent &&
        a.status !== AttendanceStatus.excused,
    ).length;
    const missingCheckIn = schedulesToday.filter(
      (s) =>
        !recorded.has(s.staffId) &&
        s.startAt!.getTime() + tolerance * MINUTE_MS < now.getTime(),
    ).length;
    // Tablero de entradas: primero quien debió llegar y no ha checado, luego por hora
    const board = schedulesToday
      .map((s) => {
        const a = recorded.get(s.staffId);
        const late =
          s.startAt!.getTime() + tolerance * MINUTE_MS < now.getTime();
        const state: BoardState = a
          ? a.status === AttendanceStatus.absent
            ? 'absent'
            : a.status === AttendanceStatus.excused
              ? 'excused'
              : a.checkOutAt
                ? 'done'
                : a.status === AttendanceStatus.late
                  ? 'late'
                  : 'on_time'
          : late
            ? 'missing'
            : 'scheduled';
        return {
          staff: s.staff,
          startAt: s.startAt!,
          endAt: s.endAt!,
          checkInAt: a?.checkInAt ?? null,
          lateMinutes: a?.lateMinutes ?? 0,
          state,
        };
      })
      .sort(
        (x, y) =>
          Number(y.state === 'missing') - Number(x.state === 'missing') ||
          x.startAt.getTime() - y.startAt.getTime(),
      );

    const todayCounts = emptyCounts();
    for (const a of attendanceToday) todayCounts[a.status]++;

    // Tendencia de los últimos días, incluidos los que no tienen registros
    const trend = Array.from({ length: TREND_DAYS }, (_, i) => ({
      date: dateKey(addDays(trendFrom, i)),
      ...emptyCounts(),
    }));
    for (const r of trendRows) {
      const row = trend.find((t) => t.date === dateKey(r.attendanceDate));
      if (row) row[r.status] += r._count._all;
    }

    const evalCount = (s: EvaluationStatus) =>
      evaluations.find((e) => e.status === s)?._count._all ?? 0;

    return {
      staff: {
        total: byStatus.reduce((t, r) => t + r._count._all, 0),
        active: staffStatus.active ?? 0,
        vacation: staffStatus.vacation ?? 0,
        sickLeave: staffStatus.sick_leave ?? 0,
        suspended: staffStatus.suspended ?? 0,
        byRole: byRole
          .map((r) => ({ role: r.role, count: r._count._all }))
          .sort((a, b) => b.count - a.count),
      },
      today: {
        scheduled: schedulesToday.length,
        started: schedulesToday.filter((s) => s.startAt! <= now).length,
        onShiftNow,
        working,
        missingCheckIn,
        attendance: todayCounts,
      },
      board,
      trend,
      documents: {
        alertDays: expirations.alertDays,
        expired: expirations.items.filter((d) => d.status === 'expired').length,
        expiring: expirations.items.filter((d) => d.status === 'expiring')
          .length,
      },
      evaluations: {
        drafts: evalCount(EvaluationStatus.draft),
        pendingAcknowledge: evalCount(EvaluationStatus.finalized),
      },
    };
  }

  /** Resumen del mes en curso del empleado ligado al usuario; null si no hay empleado. */
  private async me(user: AuthUser) {
    const staff = await this.prisma.staff.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!staff) return null;

    const day = today();
    const monthStart = new Date(
      Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1),
    );
    const records = await this.prisma.staffAttendance.findMany({
      where: {
        staffId: staff.id,
        attendanceDate: { gte: monthStart, lte: day },
      },
      select: { status: true, lateMinutes: true, overtimeMinutes: true },
    });
    const counts = emptyCounts();
    for (const r of records) counts[r.status]++;
    return {
      month: dateKey(monthStart).slice(0, 7),
      attendance: counts,
      lateMinutes: records.reduce((t, r) => t + r.lateMinutes, 0),
      overtimeMinutes: records.reduce((t, r) => t + r.overtimeMinutes, 0),
    };
  }
}
