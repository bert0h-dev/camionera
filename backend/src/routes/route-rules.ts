// Reglas puras de rutas: validación y cálculo de horas locales entre zonas horarias.

export interface RouteInput {
  originTerminalId: string;
  destinationTerminalId: string;
}

/** Error de negocio de una ruta o null si es válida. */
export function routeError(r: RouteInput): string | null {
  if (r.originTerminalId === r.destinationTerminalId)
    return 'El origen y el destino deben ser terminales distintas';
  return null;
}

const partsFormatter = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string) {
  let f = partsFormatter.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatter.set(tz, f);
  }
  return f;
}

/** Fecha y hora de pared de un instante en la zona dada. */
export function wallTime(instant: Date, tz: string) {
  const p = Object.fromEntries(
    formatter(tz)
      .formatToParts(instant)
      .map((x) => [x.type, x.value]),
  );
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    seconds: Number(p.second),
  };
}

/** Minutos de diferencia de la zona contra UTC en ese instante (México centro = −360). */
export function offsetMinutes(instant: Date, tz: string) {
  const w = wallTime(instant, tz);
  const asUtc = Date.parse(`${w.date}T${w.time}:00Z`) + w.seconds * 1000;
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** Instante que corresponde a una fecha y hora local (YYYY-MM-DD, HH:mm) en la zona dada. */
export function zonedInstant(date: string, time: string, tz: string) {
  const guess = Date.parse(`${date}T${time}:00Z`);
  const off = offsetMinutes(new Date(guess), tz);
  let t = guess - off * 60000;
  const off2 = offsetMinutes(new Date(t), tz);
  if (off2 !== off) t = guess - off2 * 60000;
  return new Date(t);
}

/**
 * Llegada en hora local del destino para una salida en hora local del origen.
 * `dayOffset` indica cuántos días después de la salida (según el calendario del destino).
 */
export function localArrival(
  date: string,
  departureTime: string,
  originTz: string,
  durationMinutes: number,
  destinationTz: string,
) {
  const departure = zonedInstant(date, departureTime, originTz);
  const arrival = new Date(departure.getTime() + durationMinutes * 60000);
  const w = wallTime(arrival, destinationTz);
  const dayOffset = Math.round(
    (Date.parse(`${w.date}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) /
      86400000,
  );
  return { departure, arrival, date: w.date, time: w.time, dayOffset };
}
