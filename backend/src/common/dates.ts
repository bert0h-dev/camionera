// Utilidades para columnas @db.Date, que se manejan como medianoche UTC

const DAY_MS = 24 * 60 * 60 * 1000;
/** Zona por defecto; la real viene del parámetro `company.timezone` (ver SettingsService). */
export const DEFAULT_BUSINESS_TIMEZONE = 'America/Mexico_City';
let businessTz = DEFAULT_BUSINESS_TIMEZONE;

/** Zona horaria de la central configurada en Parámetros › Empresa. */
export const businessTimezone = () => businessTz;

/** La fija SettingsService al arrancar y cada vez que se guarda el parámetro. */
export function setBusinessTimezone(tz: string) {
  businessTz = tz || DEFAULT_BUSINESS_TIMEZONE;
}

/** Hora local (0–23) de la central en este momento. */
export function businessHour(at = new Date()) {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: businessTz,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(at),
  );
}

/** 'AAAA-MM-DD' a Date en UTC. */
export const toDate = (value: string) => new Date(`${value}T00:00:00Z`);

/** Fecha de hoy en la zona horaria del negocio, como medianoche UTC. */
export function today(timeZone = businessTimezone()): Date {
  // en-CA formatea como AAAA-MM-DD
  return toDate(
    new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date()),
  );
}

export const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * DAY_MS);

/** Días enteros de `from` a `to` (negativo si `to` ya pasó). */
export const daysBetween = (from: Date, to: Date) =>
  Math.round((to.getTime() - from.getTime()) / DAY_MS);

/** Desfase en ms de `timeZone` respecto a UTC en el instante `at`. */
function tzOffsetMs(at: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - at.getTime();
}

/** Fecha 'AAAA-MM-DD' + hora local 'HH:mm' en `timeZone` → instante UTC. */
export function zonedDateTime(
  date: string,
  time: string,
  timeZone = businessTimezone(),
): Date {
  const naive = new Date(`${date}T${time}:00Z`);
  // Dos pasadas para cubrir cambios de horario
  const first = new Date(naive.getTime() - tzOffsetMs(naive, timeZone));
  return new Date(naive.getTime() - tzOffsetMs(first, timeZone));
}

/** Date (medianoche UTC) → 'AAAA-MM-DD'. */
export const dateKey = (date: Date) => date.toISOString().slice(0, 10);

/** Lunes de la semana de `date` (columna @db.Date). */
export function weekStart(date: Date): Date {
  const weekday = (date.getUTCDay() + 6) % 7; // lunes = 0
  return addDays(date, -weekday);
}
