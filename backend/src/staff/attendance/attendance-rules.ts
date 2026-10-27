import { AttendanceStatus } from '../../generated/prisma/enums.js';

const MINUTE_MS = 60 * 1000;

export interface AttendanceRules {
  lateToleranceMinutes: number;
  halfDayPercent: number;
  overtimeThresholdMinutes: number;
}

export interface ShiftWindow {
  startAt: Date | null;
  endAt: Date | null;
  breakMinutes: number;
  isRestDay: boolean;
}

export interface AttendanceCalc {
  status: AttendanceStatus;
  lateMinutes: number;
  workedMinutes: number;
  overtimeMinutes: number;
}

const minutesBetween = (from: Date, to: Date) =>
  Math.floor((to.getTime() - from.getTime()) / MINUTE_MS);

/**
 * Calcula estado, retardo, minutos trabajados y extras de un registro.
 * - Sin turno (o en día de descanso): presente, sin retardo ni extras; cuenta lo trabajado.
 * - Retardo si la entrada pasa la tolerancia; medio día si trabajó menos del % del turno.
 * - Extras: minutos después del fin del turno, solo si superan el umbral.
 */
export function computeAttendance(
  shift: ShiftWindow | null,
  checkInAt: Date,
  checkOutAt: Date | null,
  rules: AttendanceRules,
): AttendanceCalc {
  const hasShift =
    !!shift && !shift.isRestDay && !!shift.startAt && !!shift.endAt;
  const breakMinutes = hasShift ? shift.breakMinutes : 0;
  const workedMinutes = checkOutAt
    ? Math.max(0, minutesBetween(checkInAt, checkOutAt) - breakMinutes)
    : 0;

  if (!hasShift) {
    return {
      status: AttendanceStatus.present,
      lateMinutes: 0,
      workedMinutes,
      overtimeMinutes: 0,
    };
  }

  const startAt = shift.startAt!;
  const endAt = shift.endAt!;
  const lateMinutes = Math.max(0, minutesBetween(startAt, checkInAt));

  let status: AttendanceStatus =
    lateMinutes > rules.lateToleranceMinutes
      ? AttendanceStatus.late
      : AttendanceStatus.present;
  let overtimeMinutes = 0;

  if (checkOutAt) {
    const scheduledMinutes = minutesBetween(startAt, endAt) - breakMinutes;
    if (workedMinutes < (scheduledMinutes * rules.halfDayPercent) / 100)
      status = AttendanceStatus.half_day;

    const afterEnd = minutesBetween(endAt, checkOutAt);
    if (afterEnd > rules.overtimeThresholdMinutes) overtimeMinutes = afterEnd;
  }

  return { status, lateMinutes, workedMinutes, overtimeMinutes };
}
