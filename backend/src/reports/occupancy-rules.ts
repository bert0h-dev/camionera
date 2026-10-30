// Ocupación de recorridos. La medida principal es por asiento-km (km ocupados / km ofrecidos), que
// con venta por tramos nunca pasa de 100 %; la de asientos (boletos / asientos) se da como referencia.

export interface SegmentSales {
  board: number;
  alight: number;
  /** Boletos vendidos en ese tramo (confirmados, abordados y no presentados) */
  sold: number;
  boarded: number;
  noShow: number;
  revenue: number;
}

export interface TripOccupancy {
  seats: number;
  sold: number;
  boarded: number;
  noShow: number;
  revenue: number;
  seatKmSold: number;
  seatKmOffered: number;
  /** % por asiento-km (0–100) */
  byKm: number;
  /** % por asientos (puede pasar de 100 con tramos) */
  bySeats: number;
  /** Asientos ocupados en cada trecho entre puntos consecutivos */
  legs: number[];
}

const pct = (a: number, b: number) =>
  b > 0 ? Math.round((a / b) * 1000) / 10 : 0;

/**
 * Ocupación de un recorrido. `km[i]` son los km acumulados del punto i (0 = origen, el último =
 * destino). Si la ruta no tiene km, cada trecho pesa lo mismo.
 */
export function tripOccupancy(
  seats: number,
  km: number[],
  segments: SegmentSales[],
): TripOccupancy {
  const points = km.length;
  const hasKm = km[points - 1] > 0;
  const kmOf = (i: number) => (hasKm ? km[i] : i);
  const total = kmOf(points - 1);
  const legs = Array.from({ length: Math.max(0, points - 1) }, () => 0);
  let sold = 0;
  let boarded = 0;
  let noShow = 0;
  let revenue = 0;
  let seatKmSold = 0;
  for (const s of segments) {
    sold += s.sold;
    boarded += s.boarded;
    noShow += s.noShow;
    revenue += s.revenue;
    seatKmSold += s.sold * (kmOf(s.alight) - kmOf(s.board));
    for (let i = s.board; i < s.alight && i < legs.length; i++)
      legs[i] += s.sold;
  }
  const seatKmOffered = seats * total;
  return {
    seats,
    sold,
    boarded,
    noShow,
    revenue: Math.round(revenue * 100) / 100,
    seatKmSold,
    seatKmOffered,
    byKm: Math.min(100, pct(seatKmSold, seatKmOffered)),
    bySeats: pct(sold, seats),
    legs,
  };
}

/** Franjas de 3 h para el mapa de calor (00–03, 03–06, … 21–24). */
export const HOUR_SLOTS = [0, 3, 6, 9, 12, 15, 18, 21] as const;
export const slotOf = (hour: number) => Math.min(7, Math.floor(hour / 3));

export type OccupancyBand = 'empty' | 'low' | 'mid' | 'full';
/** Casi vacío (< 25 %), bajo (< 50 %), medio y casi lleno (≥ 90 %). */
export const bandOf = (p: number): OccupancyBand =>
  p < 25 ? 'empty' : p < 50 ? 'low' : p < 90 ? 'mid' : 'full';

/** Promedio ponderado: suma de lo ocupado entre suma de lo ofrecido. */
export const weighted = (
  rows: { seatKmSold: number; seatKmOffered: number }[],
) =>
  pct(
    rows.reduce((a, r) => a + r.seatKmSold, 0),
    rows.reduce((a, r) => a + r.seatKmOffered, 0),
  );
