// Plantilla de asientos de un modelo de bus. Se guarda como JSON en bus_models.layout
// y cada unidad recibe una copia (Módulo 3.1). Las celdas vacías no se guardan.

export const CELL_TYPES = [
  'seat',
  'aisle',
  'bathroom',
  'stairs',
  'driver',
  'door',
  'cafe',
] as const;
export type CellType = (typeof CELL_TYPES)[number];

export const SEAT_CATEGORIES = ['normal', 'preferred', 'accessible'] as const;
export type SeatCategory = (typeof SEAT_CATEGORIES)[number];

export interface LayoutCell {
  r: number;
  c: number;
  type: CellType;
  /** Solo asientos: número visible al pasajero */
  number?: string;
  category?: SeatCategory;
}

export interface LayoutFloor {
  rows: number;
  cols: number;
  cells: LayoutCell[];
}

export interface BusLayout {
  floors: LayoutFloor[];
}

export const LIMITS = { minRows: 1, maxRows: 25, minCols: 2, maxCols: 7 };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Asientos de todos los pisos, en orden de piso, fila y columna. */
export function seatsOf(layout: BusLayout) {
  return layout.floors.flatMap((f, floor) =>
    f.cells
      .filter((c) => c.type === 'seat')
      .sort((a, b) => a.r - b.r || a.c - b.c)
      .map((cell) => ({ floor, ...cell })),
  );
}

export const seatCount = (layout: BusLayout) => seatsOf(layout).length;

/**
 * Valida la forma y las reglas del layout. Devuelve la lista de errores (vacía si es válido).
 * `floorsAllowed` = 2 solo para autobuses de doble piso.
 */
export function validateLayout(raw: unknown, floorsAllowed: 1 | 2): string[] {
  if (!isObject(raw) || !Array.isArray(raw.floors))
    return ['El layout no tiene un formato válido'];
  const floors = raw.floors as unknown[];
  if (floors.length < 1 || floors.length > floorsAllowed)
    return [
      floorsAllowed === 1
        ? 'Este tipo de autobús solo tiene un piso'
        : 'Un autobús de doble piso debe tener 1 o 2 pisos',
    ];

  const errors: string[] = [];
  const numbers = new Set<string>();
  let drivers = 0;

  floors.forEach((f, i) => {
    const label = floors.length > 1 ? `Piso ${i + 1}: ` : '';
    if (!isObject(f) || !Array.isArray(f.cells)) {
      errors.push(`${label}formato inválido`);
      return;
    }
    const rows = Number(f.rows);
    const cols = Number(f.cols);
    if (
      !Number.isInteger(rows) ||
      rows < LIMITS.minRows ||
      rows > LIMITS.maxRows
    )
      errors.push(
        `${label}las filas deben estar entre ${LIMITS.minRows} y ${LIMITS.maxRows}`,
      );
    if (
      !Number.isInteger(cols) ||
      cols < LIMITS.minCols ||
      cols > LIMITS.maxCols
    )
      errors.push(
        `${label}las columnas deben estar entre ${LIMITS.minCols} y ${LIMITS.maxCols}`,
      );

    const taken = new Set<string>();
    for (const cell of f.cells as unknown[]) {
      if (!isObject(cell) || !CELL_TYPES.includes(cell.type as CellType)) {
        errors.push(`${label}hay una celda con tipo desconocido`);
        continue;
      }
      const r = Number(cell.r);
      const c = Number(cell.c);
      if (
        !Number.isInteger(r) ||
        !Number.isInteger(c) ||
        r < 0 ||
        c < 0 ||
        r >= rows ||
        c >= cols
      ) {
        errors.push(`${label}hay una celda fuera de la cuadrícula`);
        continue;
      }
      const key = `${r}:${c}`;
      if (taken.has(key))
        errors.push(
          `${label}la posición fila ${r + 1}, columna ${c + 1} está repetida`,
        );
      taken.add(key);

      if (cell.type === 'driver') {
        drivers++;
        if (i > 0) errors.push('El lugar del conductor va en el primer piso');
      }
      if (cell.type === 'seat') {
        const number =
          typeof cell.number === 'string' ? cell.number.trim() : '';
        if (!number) errors.push(`${label}hay un asiento sin número`);
        else if (numbers.has(number))
          errors.push(`El asiento ${number} está repetido`);
        numbers.add(number);
        if (
          cell.category !== undefined &&
          !SEAT_CATEGORIES.includes(cell.category as SeatCategory)
        )
          errors.push(
            `El asiento ${number || '?'} tiene una categoría desconocida`,
          );
      }
    }
  });

  if (drivers > 1) errors.push('Solo puede haber un lugar de conductor');
  if (errors.length === 0 && numbers.size === 0)
    errors.push('El layout debe tener al menos un asiento');
  return [...new Set(errors)];
}

/** Vuelve a numerar los asientos 1, 2, 3… en orden de piso, fila y columna. */
export function renumber(layout: BusLayout): BusLayout {
  let n = 0;
  return {
    floors: layout.floors.map((f) => ({
      ...f,
      cells: [...f.cells]
        .sort((a, b) => a.r - b.r || a.c - b.c)
        .map((cell) =>
          cell.type === 'seat' ? { ...cell, number: String(++n) } : cell,
        ),
    })),
  };
}

/** Ventana si está en la orilla; pasillo si tiene un pasillo al lado en su fila; centro en otro caso. */
export function seatPosition(
  floor: LayoutFloor,
  cell: Pick<LayoutCell, 'r' | 'c'>,
) {
  if (cell.c === 0 || cell.c === floor.cols - 1) return 'window' as const;
  const aisle = (c: number) =>
    floor.cells.some((x) => x.r === cell.r && x.c === c && x.type === 'aisle');
  return aisle(cell.c - 1) || aisle(cell.c + 1)
    ? ('aisle' as const)
    : ('middle' as const);
}

/**
 * Layout inicial típico 2 + pasillo + 2: conductor y puerta al frente, baño atrás.
 * Con `floors` = 2 el segundo piso es solo de asientos con escalera.
 */
export function defaultLayout(rows = 11, floors: 1 | 2 = 1): BusLayout {
  const cols = 5;
  const floor = (first: boolean): LayoutFloor => {
    const cells: LayoutCell[] = [];
    for (let r = 0; r < rows; r++) {
      cells.push({ r, c: 2, type: 'aisle' });
      for (const c of [0, 1, 3, 4]) {
        if (first && r === 0 && c < 2) continue; // conductor y puerta
        if (r === rows - 1 && c >= 3) continue; // baño o escalera atrás
        cells.push({ r, c, type: 'seat', category: 'normal' });
      }
    }
    if (first) {
      cells.push({ r: 0, c: 0, type: 'driver' }, { r: 0, c: 1, type: 'door' });
      cells.push({ r: rows - 1, c: 3, type: 'bathroom' });
    } else {
      cells.push({ r: rows - 1, c: 3, type: 'stairs' });
    }
    return { rows, cols, cells };
  };
  const base = {
    floors: floors === 2 ? [floor(true), floor(false)] : [floor(true)],
  };
  return renumber(base);
}
