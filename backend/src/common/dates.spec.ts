import { afterEach, describe, expect, it } from 'vitest';
import {
  businessTimezone,
  DEFAULT_BUSINESS_TIMEZONE,
  setBusinessTimezone,
  zonedDateTime,
} from './dates.js';

describe('zona horaria de la central', () => {
  afterEach(() => setBusinessTimezone(DEFAULT_BUSINESS_TIMEZONE));

  it('por defecto es el centro de México', () => {
    expect(businessTimezone()).toBe('America/Mexico_City');
    expect(zonedDateTime('2026-03-10', '08:00').toISOString()).toBe(
      '2026-03-10T14:00:00.000Z',
    );
  });

  it('las funciones de fecha usan la zona configurada', () => {
    setBusinessTimezone('America/Tijuana');
    // Tijuana en verano: UTC−7
    expect(zonedDateTime('2026-07-10', '08:00').toISOString()).toBe(
      '2026-07-10T15:00:00.000Z',
    );
  });

  it('un valor vacío vuelve a la zona por defecto', () => {
    setBusinessTimezone('');
    expect(businessTimezone()).toBe(DEFAULT_BUSINESS_TIMEZONE);
  });
});
