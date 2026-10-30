// Reglas comunes de los reportes: periodos, días en la zona de la central y agrupaciones.

import { fromCents, toCents } from '../tickets/money.js';

/** Periodo máximo de un reporte (un año y un día, para cubrir años bisiestos). */
export const MAX_RANGE_DAYS = 366;

const DAY = 86_400_000;
const parse = (key: string) => Date.parse(`${key}T00:00:00Z`);

/** null si el periodo 'AAAA-MM-DD'..'AAAA-MM-DD' es válido; si no, el motivo. */
export function rangeError(from: string, to: string): string | null {
  if (to < from) return 'La fecha final es anterior a la inicial';
  if ((parse(to) - parse(from)) / DAY + 1 > MAX_RANGE_DAYS)
    return `El periodo no puede pasar de ${MAX_RANGE_DAYS} días`;
  return null;
}

/** Todos los días del periodo, para llenar con ceros los que no tienen datos. */
export function daysOf(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = parse(from); t <= parse(to); t += DAY)
    out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** Periodo anterior del mismo largo (para comparar). */
export function previousRange(from: string, to: string) {
  const len = (parse(to) - parse(from)) / DAY + 1;
  const prevTo = new Date(parse(from) - DAY).toISOString().slice(0, 10);
  const prevFrom = new Date(parse(from) - len * DAY).toISOString().slice(0, 10);
  return { from: prevFrom, to: prevTo };
}

/** Día 'AAAA-MM-DD' de un instante en la zona indicada. */
export function dayIn(instant: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/**
 * Suma en centavos por clave. `rows` produce [clave, campos numéricos]; el resultado trae los
 * campos en pesos, ordenado por el campo `sortBy` de mayor a menor.
 */
export function sumBy<K extends string>(
  rows: Iterable<[string, Record<K, number>]>,
  sortBy?: K,
): ({ key: string } & Record<K, number>)[] {
  const map = new Map<string, Record<string, number>>();
  for (const [key, values] of rows) {
    const acc = map.get(key) ?? {};
    for (const [k, v] of Object.entries(values) as [string, number][])
      acc[k] = (acc[k] ?? 0) + toCents(v);
    map.set(key, acc);
  }
  const out = [...map.entries()].map(([key, acc]) => ({
    key,
    ...(Object.fromEntries(
      Object.entries(acc).map(([k, v]) => [k, fromCents(v)]),
    ) as Record<K, number>),
  }));
  if (sortBy) out.sort((a, b) => b[sortBy] - a[sortBy]);
  return out;
}

/** Cambio porcentual contra el periodo anterior (null si antes era cero). */
export const change = (current: number, previous: number) =>
  previous === 0
    ? null
    : Math.round(((current - previous) / previous) * 1000) / 10;
