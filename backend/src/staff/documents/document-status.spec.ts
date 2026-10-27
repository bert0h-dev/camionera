import { toDate } from '../../common/dates.js';
import { documentState, isValidOn } from './document-status.js';

describe('documentState', () => {
  const today = toDate('2026-10-27');

  it('vigente si vence después del periodo de alerta', () => {
    expect(documentState(toDate('2027-01-01'), today, 30)).toEqual({ status: 'valid', daysToExpiry: 66 });
  });

  it('por vencer dentro del periodo de alerta (incluye el último día)', () => {
    expect(documentState(toDate('2026-11-26'), today, 30).status).toBe('expiring');
    expect(documentState(toDate('2026-11-27'), today, 30).status).toBe('valid');
  });

  it('vence hoy sigue siendo válido hoy (por vencer)', () => {
    expect(documentState(today, today, 30)).toEqual({ status: 'expiring', daysToExpiry: 0 });
  });

  it('vencido desde el día siguiente', () => {
    expect(documentState(toDate('2026-10-26'), today, 30)).toEqual({ status: 'expired', daysToExpiry: -1 });
  });

  it('sin vencimiento siempre es vigente', () => {
    expect(documentState(null, today, 30)).toEqual({ status: 'valid', daysToExpiry: null });
  });
});

describe('isValidOn', () => {
  const doc = { issueDate: toDate('2025-01-01'), expiryDate: toDate('2026-01-01') };

  it('válido entre expedición y vencimiento, inclusive', () => {
    expect(isValidOn(doc, toDate('2025-01-01'))).toBe(true);
    expect(isValidOn(doc, toDate('2026-01-01'))).toBe(true);
  });

  it('no válido antes de expedirse ni después de vencer', () => {
    expect(isValidOn(doc, toDate('2024-12-31'))).toBe(false);
    expect(isValidOn(doc, toDate('2026-01-02'))).toBe(false);
  });

  it('sin vencimiento es válido desde la expedición', () => {
    expect(isValidOn({ issueDate: toDate('2025-01-01'), expiryDate: null }, toDate('2099-01-01'))).toBe(true);
  });
});
