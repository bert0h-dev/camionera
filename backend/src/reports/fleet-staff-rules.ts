// Reglas de los reportes de flota y personal: km por recorrido, costo por km, puntualidad y asistencia.

/** Retraso que todavía cuenta como salida a tiempo. */
export const ON_TIME_MINUTES = 10;

/** Km de un recorrido: por odómetro si está completo; si no, los de la ruta, marcados como estimados. */
export function tripKm(
  startKm: number | null,
  endKm: number | null,
  routeKm: number | null,
): { km: number; estimated: boolean } {
  if (startKm != null && endKm != null && endKm >= startKm)
    return { km: endKm - startKm, estimated: false };
  return { km: Math.max(0, Math.round(routeKm ?? 0)), estimated: true };
}

/** Costo por km (null si no hay km). */
export const costPerKm = (cost: number, km: number) =>
  km > 0 ? Math.round((cost / km) * 100) / 100 : null;

/** Rendimiento km/L (null si no hay litros medidos). */
export const efficiency = (km: number, liters: number) =>
  liters > 0 ? Math.round((km / liters) * 100) / 100 : null;

/** % del rendimiento real contra el esperado del modelo (negativo = peor). */
export const efficiencyGap = (
  actual: number | null,
  expected: number | null,
) =>
  actual != null && expected
    ? Math.round(((actual - expected) / expected) * 1000) / 10
    : null;

/** Minutos de retraso de una salida (negativo si salió antes). */
export const delayMinutes = (scheduled: Date, actual: Date) =>
  Math.round((actual.getTime() - scheduled.getTime()) / 60_000);

/** Puntualidad de un conjunto de salidas: % a tiempo y retraso promedio (solo de las tardías). */
export function punctuality(delays: number[]) {
  if (!delays.length) return { onTimeRate: null, avgDelay: null, late: 0 };
  const late = delays.filter((d) => d >= ON_TIME_MINUTES);
  return {
    onTimeRate:
      Math.round(((delays.length - late.length) / delays.length) * 1000) / 10,
    avgDelay: late.length
      ? Math.round(late.reduce((a, b) => a + b, 0) / late.length)
      : 0,
    late: late.length,
  };
}

export interface AttendanceCounts {
  present: number;
  late: number;
  half_day: number;
  absent: number;
  excused: number;
}

/** % de asistencia: días trabajados entre días que debía trabajar (los justificados no cuentan). */
export function attendanceRate(c: AttendanceCounts) {
  const due = c.present + c.late + c.half_day + c.absent;
  return due > 0
    ? Math.round(((c.present + c.late + c.half_day * 0.5) / due) * 1000) / 10
    : null;
}
