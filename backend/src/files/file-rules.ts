// Validación de imágenes subidas como data URL (logo de la empresa).

export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const LOGO_MAX_BYTES = 512 * 1024;

export type ParsedImage =
  | { ok: true; contentType: string; data: Buffer }
  | { ok: false; error: string };

/** Lee un data URL `data:image/png;base64,...` y valida tipo y tamaño. */
export function parseImageDataUrl(
  dataUrl: string,
  maxBytes = LOGO_MAX_BYTES,
): ParsedImage {
  const m = /^data:([a-z/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!m) return { ok: false, error: 'El archivo no es una imagen válida' };
  const contentType = m[1];
  if (!(LOGO_TYPES as readonly string[]).includes(contentType))
    return { ok: false, error: 'El logo debe ser PNG, JPG o WebP' };
  const data = Buffer.from(m[2], 'base64');
  if (data.length === 0) return { ok: false, error: 'La imagen está vacía' };
  if (data.length > maxBytes)
    return {
      ok: false,
      error: `La imagen pesa más de ${Math.round(maxBytes / 1024)} KB`,
    };
  return { ok: true, contentType, data };
}
