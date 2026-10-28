// Reglas puras del itinerario de una ruta: paradas en orden con km por tramo, tiempo y precio acumulados.

export interface StopInput {
  terminalId: string;
  /** Km del tramo desde el punto anterior (origen o parada previa) */
  legKm: number;
  durationFromOriginMinutes: number;
  /** Precio del boleto del origen hasta esta parada */
  priceFromOrigin: number;
}

export interface ItineraryRoute {
  originTerminalId: string;
  destinationTerminalId: string;
  estimatedDurationMinutes: number;
  basePrice: number;
}

export interface ItineraryResult {
  errors: string[];
  /** Km acumulados desde el origen por parada, en el mismo orden */
  kmFromOrigin: number[];
  /** Distancia total de la ruta (null si no se capturó el último tramo) */
  totalKm: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Valida el itinerario completo y calcula los km acumulados.
 * `finalLegKm` es el tramo de la última parada (u origen) al destino.
 */
export function checkItinerary(
  route: ItineraryRoute,
  stops: StopInput[],
  finalLegKm: number | null,
): ItineraryResult {
  const errors: string[] = [];
  const seen = new Set<string>();
  let km = 0;
  const kmFromOrigin: number[] = [];

  stops.forEach((s, i) => {
    const n = `Parada ${i + 1}`;
    if (
      s.terminalId === route.originTerminalId ||
      s.terminalId === route.destinationTerminalId
    )
      errors.push(`${n}: no puede ser el origen ni el destino de la ruta`);
    if (seen.has(s.terminalId))
      errors.push(`${n}: la terminal ya está en el itinerario`);
    seen.add(s.terminalId);

    if (!(s.legKm > 0))
      errors.push(`${n}: los km del tramo deben ser mayores a 0`);
    km = round2(km + s.legKm);
    kmFromOrigin.push(km);

    const prev = stops[i - 1];
    if (s.durationFromOriginMinutes <= (prev?.durationFromOriginMinutes ?? 0))
      errors.push(`${n}: debe llegar después que el punto anterior`);
    if (s.durationFromOriginMinutes >= route.estimatedDurationMinutes)
      errors.push(`${n}: debe llegar antes que el destino`);

    if (!(s.priceFromOrigin > 0))
      errors.push(`${n}: el precio debe ser mayor a 0`);
    else if (s.priceFromOrigin <= (prev?.priceFromOrigin ?? 0))
      errors.push(
        `${n}: el precio debe ser mayor que el de la parada anterior`,
      );
    if (s.priceFromOrigin >= route.basePrice)
      errors.push(
        `${n}: el precio debe ser menor que el precio base de la ruta`,
      );
  });

  if (finalLegKm !== null && !(finalLegKm > 0))
    errors.push('Los km del último tramo deben ser mayores a 0');
  if (stops.length && finalLegKm === null)
    errors.push('Captura los km del último tramo hasta el destino');

  return {
    errors,
    kmFromOrigin,
    totalKm: finalLegKm === null ? null : round2(km + finalLegKm),
  };
}

/** Precio de un tramo entre dos puntos del itinerario (precio acumulado al bajar − al subir). */
export const segmentPrice = (boardPrice: number, alightPrice: number) =>
  Math.max(0, round2(alightPrice - boardPrice));
