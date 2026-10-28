// Reglas puras de los horarios de una ruta: días, vigencia, choques y situación.

/** Situación calculada de un horario en una fecha dada. */
export type ScheduleStatus = 'current' | 'upcoming' | 'expired' | 'inactive';

export interface ScheduleWindow {
  id?: string;
  /** 'HH:mm' en hora local del origen */
  departureTime: string;
  daysOfWeek: number[];
  /** 'AAAA-MM-DD' */
  validFrom: string;
  validUntil: string | null;
  isActive: boolean;
}

export const DAY_SHORT = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
export const DAY_NAMES = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

/** Días sin repetir y ordenados (0 = domingo). */
export const normalizeDays = (days: number[]) =>
  [...new Set(days)].sort((a, b) => a - b);

/** Columna `time` de Prisma (1970-01-01 en UTC) → 'HH:mm'. */
export const timeKey = (value: Date) => value.toISOString().slice(11, 16);

/** 'HH:mm' → Date para una columna `time`. */
export const timeValue = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);

/** Error de vigencia o null. */
export function validityError(validFrom: string, validUntil: string | null) {
  if (validUntil && validUntil < validFrom)
    return 'La fecha de fin no puede ser anterior a la de inicio';
  return null;
}

/** ¿Se cruzan dos vigencias? null en el fin = indefinida. */
export function rangesOverlap(
  aFrom: string,
  aUntil: string | null,
  bFrom: string,
  bUntil: string | null,
) {
  return (
    (bUntil === null || aFrom <= bUntil) && (aUntil === null || bFrom <= aUntil)
  );
}

/**
 * Horario activo con el que choca `candidate`: misma hora, algún día en común y vigencias
 * que se cruzan. Uno inactivo no choca con nada.
 */
export function findClash<T extends ScheduleWindow>(
  candidate: ScheduleWindow,
  existing: T[],
): T | null {
  if (!candidate.isActive) return null;
  return (
    existing.find(
      (s) =>
        s.isActive &&
        s.id !== candidate.id &&
        s.departureTime === candidate.departureTime &&
        s.daysOfWeek.some((d) => candidate.daysOfWeek.includes(d)) &&
        rangesOverlap(
          candidate.validFrom,
          candidate.validUntil,
          s.validFrom,
          s.validUntil,
        ),
    ) ?? null
  );
}

/** Situación del horario en `today` ('AAAA-MM-DD'). */
export function scheduleStatus(
  s: Pick<ScheduleWindow, 'validFrom' | 'validUntil' | 'isActive'>,
  today: string,
): ScheduleStatus {
  if (!s.isActive) return 'inactive';
  if (s.validFrom > today) return 'upcoming';
  if (s.validUntil !== null && s.validUntil < today) return 'expired';
  return 'current';
}

/** 'L M V' para los días de un horario; atajos para diario, entre semana y fin de semana. */
export function daysLabel(days: number[]) {
  const d = normalizeDays(days);
  if (d.length === 7) return 'Diario';
  if (d.join() === '1,2,3,4,5') return 'Lunes a viernes';
  if (d.join() === '0,6') return 'Fin de semana';
  return d.map((x) => DAY_NAMES[x]).join(', ');
}
