// Reglas puras de andenes: un andén está ocupado desde N minutos antes de la salida hasta la salida.

import type { Issue } from './assignment-rules.js';

export interface PlatformTrip {
  id: string;
  tripNumber: string;
  departureAt: Date;
  platformId: string | null;
}

export interface PlatformOption {
  id: string;
  code: string;
  terminalId: string;
  isActive: boolean;
}

const MIN = 60_000;

/** Ventana en la que el recorrido ocupa su andén: [salida − minutos, salida]. */
export function occupancyWindow(departureAt: Date, boardingMinutes: number) {
  return {
    from: new Date(departureAt.getTime() - boardingMinutes * MIN),
    to: departureAt,
  };
}

/** Recorridos que ocupan `platformId` encimándose con la ventana del recorrido (excluye al propio). */
export function platformConflicts(
  trip: Pick<PlatformTrip, 'id' | 'departureAt'>,
  platformId: string,
  others: PlatformTrip[],
  boardingMinutes: number,
) {
  const mine = occupancyWindow(trip.departureAt, boardingMinutes);
  return others.filter((o) => {
    if (o.id === trip.id || o.platformId !== platformId) return false;
    const w = occupancyWindow(o.departureAt, boardingMinutes);
    // Dos salidas a la misma hora chocan aunque la ventana sea de 0 minutos
    return (
      w.from.getTime() <= mine.to.getTime() &&
      w.to.getTime() >= mine.from.getTime()
    );
  });
}

/**
 * Observaciones al poner un andén: debe ser de la terminal de origen y estar activo (block);
 * si otro recorrido lo ocupa, solo un admin lo puede forzar con motivo (override).
 */
export function platformIssues(
  platform: PlatformOption,
  originTerminalId: string,
  conflicts: Pick<PlatformTrip, 'tripNumber'>[],
): Issue[] {
  const issues: Issue[] = [];
  if (platform.terminalId !== originTerminalId)
    issues.push({
      level: 'block',
      message: `El andén ${platform.code} no es de la terminal de origen`,
    });
  if (!platform.isActive)
    issues.push({
      level: 'block',
      message: `El andén ${platform.code} está desactivado`,
    });
  if (conflicts.length)
    issues.push({
      level: 'override',
      message: `El andén ${platform.code} está ocupado por ${conflicts
        .map((c) => c.tripNumber)
        .join(', ')}`,
    });
  return issues;
}
