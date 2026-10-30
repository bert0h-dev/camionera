// Itinerario de un recorrido: origen, paradas y destino con su índice, hora de paso y precio acumulado.

export interface ItineraryStopInput {
  terminalId: string;
  code: string;
  name: string;
  cityId: string;
  cityName: string;
  timezone: string;
  /** Minutos desde la salida del origen */
  minutes: number;
  /** Precio del boleto desde el origen hasta este punto */
  priceFromOrigin: number;
}

export interface ItineraryPoint extends ItineraryStopInput {
  index: number;
  /** Instante de paso según la salida programada del recorrido */
  at: Date;
}

/**
 * Puntos del recorrido. El destino toma la duración copiada en el recorrido (no la actual de la
 * ruta) para que coincida con su hora de llegada.
 */
export function tripItinerary(
  departureAt: Date,
  durationMinutes: number,
  origin: Omit<ItineraryStopInput, 'minutes' | 'priceFromOrigin'>,
  stops: ItineraryStopInput[],
  destination: Omit<ItineraryStopInput, 'minutes'>,
): ItineraryPoint[] {
  const raw: ItineraryStopInput[] = [
    { ...origin, minutes: 0, priceFromOrigin: 0 },
    ...stops,
    { ...destination, minutes: durationMinutes },
  ];
  return raw.map((p, index) => ({
    ...p,
    index,
    at: new Date(departureAt.getTime() + p.minutes * 60_000),
  }));
}

/** Tarifa sin temporada de un tramo del itinerario. */
export const segmentBase = (
  points: ItineraryPoint[],
  board: number,
  alight: number,
) =>
  Math.max(
    0,
    Math.round(
      (points[alight].priceFromOrigin - points[board].priceFromOrigin) * 100,
    ) / 100,
  );
