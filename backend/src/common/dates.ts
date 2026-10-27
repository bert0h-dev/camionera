// Utilidades para columnas @db.Date, que se manejan como medianoche UTC

const DAY_MS = 24 * 60 * 60 * 1000;
export const BUSINESS_TIMEZONE = 'America/Mexico_City';

/** 'AAAA-MM-DD' a Date en UTC. */
export const toDate = (value: string) => new Date(`${value}T00:00:00Z`);

/** Fecha de hoy en la zona horaria del negocio, como medianoche UTC. */
export function today(timeZone = BUSINESS_TIMEZONE): Date {
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
