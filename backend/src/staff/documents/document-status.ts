import { addDays, daysBetween } from '../../common/dates.js';

export type DocumentStatus = 'valid' | 'expiring' | 'expired';

export interface DocumentState {
  status: DocumentStatus;
  /** Días hasta el vencimiento (negativo si ya venció); null si no vence. */
  daysToExpiry: number | null;
}

/** Un documento vence al terminar el día de `expiryDate`. */
export function documentState(
  expiryDate: Date | null,
  today: Date,
  alertDays: number,
): DocumentState {
  if (!expiryDate) return { status: 'valid', daysToExpiry: null };

  const daysToExpiry = daysBetween(today, expiryDate);
  if (expiryDate < today) return { status: 'expired', daysToExpiry };
  if (expiryDate <= addDays(today, alertDays))
    return { status: 'expiring', daysToExpiry };
  return { status: 'valid', daysToExpiry };
}

/** Vigente en `date`: expedido en o antes y sin vencer (o sin vencimiento). */
export const isValidOn = (
  doc: { issueDate: Date; expiryDate: Date | null },
  date: Date,
) => doc.issueDate <= date && (!doc.expiryDate || doc.expiryDate >= date);
