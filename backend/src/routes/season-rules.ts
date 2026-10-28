// Reglas puras de las temporadas globales y del precio vigente (redondeado a peso entero).

import { SeasonType } from '../generated/prisma/enums.js';
import { rangesOverlap } from './schedule-rules.js';

export interface SeasonWindow {
  id?: string;
  name: string;
  seasonType: SeasonType;
  /** 'AAAA-MM-DD' */
  validFrom: string;
  validUntil: string;
  priceModifierPercent: number;
  isActive: boolean;
}

export type SeasonStatus = 'current' | 'upcoming' | 'past' | 'inactive';

export const SEASON_LABELS: Record<SeasonType, string> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  holiday: 'Vacaciones / festivo',
};

/** Errores de la temporada: fechas, rango del modificador y signo según el tipo. */
export function seasonErrors(s: SeasonWindow): string[] {
  const errors: string[] = [];
  if (s.validUntil < s.validFrom)
    errors.push('La fecha de fin no puede ser anterior a la de inicio');
  const pct = s.priceModifierPercent;
  if (pct < -90 || pct > 200)
    errors.push('El ajuste debe estar entre −90 % y +200 %');
  if (s.seasonType === SeasonType.low && !(pct < 0))
    errors.push(
      'Una temporada baja debe restar al precio (porcentaje negativo)',
    );
  if (
    (s.seasonType === SeasonType.high || s.seasonType === SeasonType.holiday) &&
    !(pct > 0)
  )
    errors.push(
      'Una temporada alta o de vacaciones debe sumar al precio (porcentaje positivo)',
    );
  if (s.seasonType === SeasonType.normal && pct !== 0)
    errors.push('Una temporada normal no lleva ajuste (0 %)');
  return errors;
}

/** Temporada activa con la que se cruza `candidate` en fechas (extremos incluidos). */
export function findSeasonClash<T extends SeasonWindow>(
  candidate: SeasonWindow,
  existing: T[],
): T | null {
  if (!candidate.isActive) return null;
  return (
    existing.find(
      (s) =>
        s.isActive &&
        s.id !== candidate.id &&
        rangesOverlap(
          candidate.validFrom,
          candidate.validUntil,
          s.validFrom,
          s.validUntil,
        ),
    ) ?? null
  );
}

export function seasonStatus(
  s: Pick<SeasonWindow, 'validFrom' | 'validUntil' | 'isActive'>,
  today: string,
): SeasonStatus {
  if (!s.isActive) return 'inactive';
  if (s.validFrom > today) return 'upcoming';
  if (s.validUntil < today) return 'past';
  return 'current';
}

/** Temporada activa que aplica en la fecha del viaje (como no se solapan, hay a lo más una). */
export function seasonOn<T extends SeasonWindow>(
  seasons: T[],
  date: string,
): T | null {
  return (
    seasons.find(
      (s) => s.isActive && s.validFrom <= date && date <= s.validUntil,
    ) ?? null
  );
}

/** Precio con el ajuste de temporada, redondeado a peso entero. */
export function applySeason(price: number, percent: number | null) {
  return Math.round(price * (1 + (percent ?? 0) / 100));
}
