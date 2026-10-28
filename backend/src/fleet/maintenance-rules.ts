// Cálculo del próximo servicio preventivo, sin base de datos para poder probarlo solo.
import { addDays, daysBetween } from '../common/dates.js';

export type ServiceStatus = 'ok' | 'due_soon' | 'overdue' | 'no_plan';

export interface ServicePlan {
  km: number | null;
  days: number | null;
}

export interface ServiceBase {
  /** Último preventivo terminado; si no hay, la fecha de alta de la unidad */
  date: Date;
  /** Odómetro del último preventivo; si no hay, el odómetro inicial */
  km: number;
}

export interface NextService {
  status: ServiceStatus;
  dueDate: Date | null;
  dueKm: number | null;
  /** Días que faltan (negativo = vencido) */
  daysLeft: number | null;
  /** Km que faltan (negativo = vencido) */
  kmLeft: number | null;
  /** Qué hace vencer primero el servicio */
  trigger: 'km' | 'days' | null;
}

/**
 * Próximo preventivo: último servicio + intervalo, en km y en días; manda lo que ocurra primero.
 * "Próximo" cuando faltan `alertDays` días o `alertKm` km o menos.
 */
export function nextService(
  plan: ServicePlan,
  base: ServiceBase,
  odometerKm: number,
  today: Date,
  alertDays: number,
  alertKm: number,
): NextService {
  if (!plan.km && !plan.days)
    return {
      status: 'no_plan',
      dueDate: null,
      dueKm: null,
      daysLeft: null,
      kmLeft: null,
      trigger: null,
    };

  const dueDate = plan.days ? addDays(base.date, plan.days) : null;
  const dueKm = plan.km ? base.km + plan.km : null;
  const daysLeft = dueDate ? daysBetween(today, dueDate) : null;
  const kmLeft = dueKm !== null ? dueKm - odometerKm : null;

  const overdue =
    (daysLeft !== null && daysLeft < 0) || (kmLeft !== null && kmLeft < 0);
  const soon =
    (daysLeft !== null && daysLeft <= alertDays) ||
    (kmLeft !== null && kmLeft <= alertKm);

  // El disparador es el que está más cerca, comparado en proporción de su intervalo
  let trigger: NextService['trigger'] = null;
  if (daysLeft !== null && kmLeft !== null)
    trigger = daysLeft / plan.days! <= kmLeft / plan.km! ? 'days' : 'km';
  else trigger = daysLeft !== null ? 'days' : 'km';

  return {
    status: overdue ? 'overdue' : soon ? 'due_soon' : 'ok',
    dueDate,
    dueKm,
    daysLeft,
    kmLeft,
    trigger,
  };
}

/** Folio legible: OT-000123 */
export const orderFolio = (n: number) => `OT-${String(n).padStart(6, '0')}`;
