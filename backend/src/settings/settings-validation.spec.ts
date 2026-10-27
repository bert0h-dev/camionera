import { describe, expect, it } from 'vitest';
import { validateSetting } from './settings-validation.js';
import { SETTINGS } from './settings.registry.js';

describe('validateSetting', () => {
  it('números enteros por defecto y con decimales cuando la definición lo permite', () => {
    expect(
      validateSetting(SETTINGS['documents.expiry_alert_days'], 30),
    ).toEqual({ ok: true, value: 30 });
    expect(
      validateSetting(SETTINGS['documents.expiry_alert_days'], 30.5).ok,
    ).toBe(false);
    expect(validateSetting(SETTINGS['taxes.vat_rate'], 16)).toEqual({
      ok: true,
      value: 16,
    });
    expect(
      validateSetting(SETTINGS['commissions.vendor_percent'], 2.5),
    ).toEqual({ ok: true, value: 2.5 });
    expect(
      validateSetting(SETTINGS['commissions.vendor_percent'], 2.555).ok,
    ).toBe(false);
  });

  it('respeta los límites', () => {
    const r = validateSetting(SETTINGS['commissions.online_percent'], 60);
    expect(r).toEqual({
      ok: false,
      error: 'Cargo por servicio en línea: debe estar entre 0 y 50',
    });
  });

  it('textos: recorta, permite vacío y valida el formato', () => {
    expect(validateSetting(SETTINGS['company.rfc'], '  ')).toEqual({
      ok: true,
      value: '',
    });
    expect(validateSetting(SETTINGS['company.rfc'], 'CCA010101AB1')).toEqual({
      ok: true,
      value: 'CCA010101AB1',
    });
    expect(validateSetting(SETTINGS['company.rfc'], 'XYZ').ok).toBe(false);
    expect(validateSetting(SETTINGS['company.phone'], '55123').ok).toBe(false);
    expect(validateSetting(SETTINGS['company.website'], 'www.x.mx').ok).toBe(
      false,
    );
  });

  it('booleanos y tipos equivocados', () => {
    expect(
      validateSetting(SETTINGS['taxes.prices_include_vat'], false),
    ).toEqual({ ok: true, value: false });
    expect(validateSetting(SETTINGS['taxes.prices_include_vat'], 'no').ok).toBe(
      false,
    );
    expect(validateSetting(SETTINGS['taxes.vat_rate'], '16').ok).toBe(false);
  });
});
