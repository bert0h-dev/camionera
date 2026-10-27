import type { StaffRole } from '../../generated/prisma/enums.js';

export interface ScoreInput {
  weight: number;
  score: number | null;
}

/** Promedio ponderado redondeado a 2 decimales; null si falta alguna calificación. */
export function weightedScore(scores: ScoreInput[]): number | null {
  if (scores.length === 0 || scores.some((s) => s.score == null)) return null;
  const totalWeight = scores.reduce((t, s) => t + s.weight, 0);
  if (totalWeight <= 0) return null;
  const sum = scores.reduce((t, s) => t + s.weight * s.score!, 0);
  return Math.round((sum / totalWeight) * 100) / 100;
}

/** Un criterio aplica si no tiene puestos asignados o incluye el puesto del empleado. */
export function criterionApplies(
  criterion: { appliesTo: StaffRole[]; isActive: boolean },
  role: StaffRole,
) {
  return (
    criterion.isActive &&
    (criterion.appliesTo.length === 0 || criterion.appliesTo.includes(role))
  );
}

/** Lista de criterios sin calificar; vacía si se puede finalizar. */
export function missingScores<T extends { score: number | null }>(scores: T[]) {
  return scores.filter((s) => s.score == null);
}

/** Dos periodos [inicio, fin] (fechas inclusivas) se traslapan. */
export function periodsOverlap(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date },
) {
  return a.start <= b.end && b.start <= a.end;
}
