/** Datos mínimos de una carga confirmada para medir el rendimiento. */
export interface MeasurableLoad {
  id: string;
  odometerKm: number;
  quantity: number;
  isFullTank: boolean;
}

export interface LoadMeasure {
  tripKm: number | null;
  tripQuantity: number | null;
  efficiency: number | null;
}

const round = (n: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

/**
 * Rendimiento de tanque lleno a tanque lleno: cada tanque lleno cierra un tramo
 * desde el tanque lleno anterior; los km del tramo se dividen entre todo lo cargado
 * en él (las parciales de en medio más esta carga). Las parciales y el primer
 * tanque lleno no tienen medida propia.
 * `loads` debe venir en orden de odómetro.
 */
export function measureLoads(loads: MeasurableLoad[]) {
  const result = new Map<string, LoadMeasure>();
  let lastFullKm: number | null = null;
  let accumulated = 0;
  for (const load of loads) {
    accumulated += load.quantity;
    if (!load.isFullTank) {
      result.set(load.id, {
        tripKm: null,
        tripQuantity: null,
        efficiency: null,
      });
      continue;
    }
    const tripKm = lastFullKm === null ? null : load.odometerKm - lastFullKm;
    const measured = tripKm !== null && tripKm > 0 && accumulated > 0;
    result.set(load.id, {
      tripKm: measured ? tripKm : null,
      tripQuantity: measured ? round(accumulated, 2) : null,
      efficiency: measured ? round(tripKm / accumulated, 2) : null,
    });
    lastFullKm = load.odometerKm;
    accumulated = 0;
  }
  return result;
}

/** Cuánto por ciento queda el rendimiento real por debajo del esperado (negativo = mejor). */
export const efficiencyDropPct = (actual: number, expected: number) =>
  round(((expected - actual) / expected) * 100, 1);

/** Rendimiento bajo: cae el umbral (%) o más por debajo del esperado del modelo. */
export const isLowEfficiency = (
  actual: number | null,
  expected: number | null,
  thresholdPct: number,
) =>
  actual !== null &&
  expected !== null &&
  expected > 0 &&
  efficiencyDropPct(actual, expected) >= thresholdPct;

/** Valida una carga contra el tanque del modelo y la carga confirmada anterior. */
export function fuelLoadError(
  load: { quantity: number; unitPrice: number; odometerKm: number },
  tankCapacity: number | null,
  previousKm: number | null,
) {
  if (load.quantity <= 0) return 'La cantidad debe ser mayor a cero';
  if (load.unitPrice <= 0) return 'El precio debe ser mayor a cero';
  if (tankCapacity !== null && load.quantity > tankCapacity)
    return `La cantidad pasa la capacidad del tanque (${tankCapacity.toLocaleString('es-MX')})`;
  if (previousKm !== null && load.odometerKm <= previousKm)
    return `El odómetro debe ser mayor al de la carga anterior (${previousKm.toLocaleString('es-MX')} km)`;
  return null;
}

/** Total de la carga, redondeado a centavos. */
export const fuelTotal = (quantity: number, unitPrice: number) =>
  round(quantity * unitPrice, 2);
