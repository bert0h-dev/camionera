import { addDays, weekStart } from '../../common/dates.js';

const HOUR_MS = 60 * 60 * 1000;

export interface ScheduleLike {
  id?: string;
  scheduleDate: Date;
  startAt: Date | null;
  endAt: Date | null;
  breakMinutes: number;
  isRestDay: boolean;
}

export interface ScheduleLimits {
  maxShiftHours: number;
  minRestHours: number;
  maxWeeklyHours: number;
}

/** Horas efectivamente trabajadas (sin descansos). Día de descanso = 0. */
export function workedHours(
  s: Pick<ScheduleLike, 'startAt' | 'endAt' | 'breakMinutes' | 'isRestDay'>,
) {
  if (s.isRestDay || !s.startAt || !s.endAt) return 0;
  return Math.max(
    0,
    (s.endAt.getTime() - s.startAt.getTime()) / HOUR_MS - s.breakMinutes / 60,
  );
}

const fmtHours = (h: number) => `${Math.round(h * 10) / 10} h`;
const fmtDay = (d: Date) => {
  const [y, m, day] = d.toISOString().slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
};

/**
 * Valida un turno contra los demás turnos del mismo empleado.
 * `others` debe excluir el propio turno (al editar) y cubrir al menos la semana y los días vecinos.
 * Devuelve los motivos de rechazo; vacío = válido.
 */
export function validateSchedule(
  candidate: ScheduleLike,
  others: ScheduleLike[],
  limits: ScheduleLimits,
): string[] {
  if (candidate.isRestDay) return [];
  const { startAt, endAt } = candidate;
  if (!startAt || !endAt) return ['El turno debe tener hora de inicio y fin'];

  const violations: string[] = [];
  if (endAt <= startAt)
    violations.push('La hora de fin debe ser posterior a la de inicio');

  const hours = workedHours(candidate);
  if (hours <= 0)
    violations.push('El descanso no puede ser mayor que la duración del turno');
  if (hours > limits.maxShiftHours) {
    violations.push(
      `El turno dura ${fmtHours(hours)} (máximo ${limits.maxShiftHours} h)`,
    );
  }

  const shifts = others.filter(
    (o) => !o.isRestDay && o.startAt && o.endAt,
  ) as (ScheduleLike & {
    startAt: Date;
    endAt: Date;
  })[];

  for (const o of shifts) {
    if (o.startAt < endAt && startAt < o.endAt) {
      violations.push(`Se empalma con el turno del ${fmtDay(o.scheduleDate)}`);
    }
  }

  const previous = shifts
    .filter((o) => o.endAt <= startAt)
    .sort((a, b) => b.endAt.getTime() - a.endAt.getTime())[0];
  if (previous) {
    const rest = (startAt.getTime() - previous.endAt.getTime()) / HOUR_MS;
    if (rest < limits.minRestHours) {
      violations.push(
        `Descanso insuficiente: ${fmtHours(rest)} desde el turno del ${fmtDay(previous.scheduleDate)} (mínimo ${limits.minRestHours} h)`,
      );
    }
  }
  const next = shifts
    .filter((o) => o.startAt >= endAt)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0];
  if (next) {
    const rest = (next.startAt.getTime() - endAt.getTime()) / HOUR_MS;
    if (rest < limits.minRestHours) {
      violations.push(
        `Descanso insuficiente: ${fmtHours(rest)} antes del turno del ${fmtDay(next.scheduleDate)} (mínimo ${limits.minRestHours} h)`,
      );
    }
  }

  const monday = weekStart(candidate.scheduleDate);
  const nextMonday = addDays(monday, 7);
  const weekHours =
    hours +
    others
      .filter((o) => o.scheduleDate >= monday && o.scheduleDate < nextMonday)
      .reduce((sum, o) => sum + workedHours(o), 0);
  if (weekHours > limits.maxWeeklyHours) {
    violations.push(
      `La semana del ${fmtDay(monday)} suma ${fmtHours(weekHours)} (máximo ${limits.maxWeeklyHours} h)`,
    );
  }

  return violations;
}
