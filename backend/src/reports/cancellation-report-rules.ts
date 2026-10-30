// Reglas del reporte de cancelaciones y no presentados.

/** Rangos de anticipación con que el pasajero cancela (horas antes de su subida). */
export const NOTICE_BUCKETS = [
  { key: 'lt2', label: 'Menos de 2 h', maxHours: 2 },
  { key: '2to24', label: '2 a 24 h', maxHours: 24 },
  { key: '1to3d', label: '1 a 3 días', maxHours: 72 },
  { key: 'gt3d', label: 'Más de 3 días', maxHours: Infinity },
] as const;

export type NoticeBucket = (typeof NOTICE_BUCKETS)[number]['key'];

export const noticeBucket = (hours: number): NoticeBucket =>
  NOTICE_BUCKETS.find((b) => hours < b.maxHours)!.key;

/** Motivo para agrupar: sin acentos, minúsculas, sin espacios dobles ni punto final. Vacío = "Sin motivo". */
export function normalizeReason(text: string | null | undefined) {
  const clean = (text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/, '')
    .trim();
  return clean || 'sin motivo';
}

/** Tasa en % con un decimal (0 si no hay base). */
export const rate = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;

export type RefundKind = 'passenger' | 'trip' | 'change';

/** Origen del reembolso: cancelación del pasajero, recorrido cancelado o diferencia a favor de un cambio. */
export function refundKind(reason: string, tripCancelled: boolean): RefundKind {
  if (tripCancelled || /^recorrido cancelado/i.test(reason)) return 'trip';
  if (/^diferencia a favor/i.test(reason)) return 'change';
  return 'passenger';
}
