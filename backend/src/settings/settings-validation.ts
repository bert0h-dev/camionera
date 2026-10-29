import type { SettingDefinition } from './settings.registry.js';

/**
 * Valida y normaliza un valor según su definición.
 * Devuelve el valor listo para guardar o un mensaje de error.
 */
export function validateSetting(
  def: SettingDefinition,
  raw: unknown,
):
  | { ok: true; value: number | string | boolean }
  | { ok: false; error: string } {
  const name = def.label ?? def.description;

  if (def.type === 'number') {
    if (typeof raw !== 'number' || !Number.isFinite(raw))
      return { ok: false, error: `${name}: debe ser un número` };
    const decimals = def.decimals ?? 0;
    const scaled = raw * 10 ** decimals;
    if (Math.abs(scaled - Math.round(scaled)) > 1e-9)
      return {
        ok: false,
        error:
          decimals === 0
            ? `${name}: debe ser un número entero`
            : `${name}: admite hasta ${decimals} decimales`,
      };
    if (
      (def.min !== undefined && raw < def.min) ||
      (def.max !== undefined && raw > def.max)
    )
      return {
        ok: false,
        error: `${name}: debe estar entre ${def.min} y ${def.max}`,
      };
    return { ok: true, value: raw };
  }

  if (def.type === 'boolean') {
    if (typeof raw !== 'boolean')
      return { ok: false, error: `${name}: debe ser sí o no` };
    return { ok: true, value: raw };
  }

  if (typeof raw !== 'string')
    return { ok: false, error: `${name}: debe ser texto` };
  const value = raw.trim();
  if (def.maxLength !== undefined && value.length > def.maxLength)
    return { ok: false, error: `${name}: máximo ${def.maxLength} caracteres` };
  if (def.options && !def.options.includes(value))
    return { ok: false, error: `${name}: elige una opción de la lista` };
  // Vacío está permitido: significa "sin capturar"
  if (value && def.pattern && !new RegExp(def.pattern).test(value))
    return {
      ok: false,
      error: def.patternMessage ?? `${name}: formato inválido`,
    };
  return { ok: true, value };
}
