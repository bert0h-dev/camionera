import type { BusLayout, CellType, LayoutCell, LayoutFloor, SeatCategory } from '../../lib/types'

// Espejo de backend/src/fleet/layout-rules.ts para editar sin ir al servidor; el servidor valida al guardar

export const LIMITS = { minRows: 1, maxRows: 25, minCols: 2, maxCols: 7 }

export const CELL_LABELS: Record<CellType, string> = {
  seat: 'Asiento',
  aisle: 'Pasillo',
  bathroom: 'Baño',
  stairs: 'Escalera',
  driver: 'Conductor',
  door: 'Puerta',
  cafe: 'Cafetería',
}

export const CATEGORY_LABELS: Record<SeatCategory, string> = {
  normal: 'Normal',
  preferred: 'Preferente',
  accessible: 'Accesible',
}

export const seatCount = (layout: BusLayout) =>
  layout.floors.reduce((n, f) => n + f.cells.filter((c) => c.type === 'seat').length, 0)

export const cellAt = (floor: LayoutFloor, r: number, c: number) => floor.cells.find((x) => x.r === r && x.c === c)

/** Vuelve a numerar los asientos 1, 2, 3… en orden de piso, fila y columna. */
export function renumber(layout: BusLayout): BusLayout {
  let n = 0
  return {
    floors: layout.floors.map((f) => ({
      ...f,
      cells: [...f.cells]
        .sort((a, b) => a.r - b.r || a.c - b.c)
        .map((cell) => (cell.type === 'seat' ? { ...cell, number: String(++n) } : cell)),
    })),
  }
}

/** Coloca `type` en la celda (o la vacía si ya tenía ese tipo). Los asientos nuevos toman el siguiente número. */
export function paintCell(
  layout: BusLayout,
  floorIdx: number,
  r: number,
  c: number,
  type: CellType | 'empty',
  category: SeatCategory,
): BusLayout {
  const floors = layout.floors.map((f, i) => {
    if (i !== floorIdx) return f
    const current = cellAt(f, r, c)
    const others = f.cells.filter((x) => x !== current)
    if (type === 'empty') return { ...f, cells: others }
    // Un asiento pintado con otra categoría solo cambia la categoría
    if (current?.type === 'seat' && type === 'seat') {
      if (current.category === category) return { ...f, cells: others }
      return { ...f, cells: [...others, { ...current, category }] }
    }
    if (current?.type === type) return { ...f, cells: others }
    const cell: LayoutCell = { r, c, type }
    if (type === 'seat') {
      cell.category = category
      cell.number = String(nextNumber(layout))
    }
    return { ...f, cells: [...others, cell] }
  })
  // El conductor es único: al ponerlo en un lugar se quita del anterior
  if (type === 'driver')
    return {
      floors: floors.map((f, i) => ({
        ...f,
        cells: f.cells.filter((x) => x.type !== 'driver' || (i === floorIdx && x.r === r && x.c === c)),
      })),
    }
  return { floors }
}

function nextNumber(layout: BusLayout) {
  const used = layout.floors.flatMap((f) => f.cells.map((c) => Number(c.number))).filter(Number.isFinite)
  return used.length ? Math.max(...used) + 1 : 1
}

/** Cambia el tamaño de un piso; lo que queda fuera de la cuadrícula se descarta. */
export function resizeFloor(layout: BusLayout, floorIdx: number, rows: number, cols: number): BusLayout {
  return {
    floors: layout.floors.map((f, i) =>
      i === floorIdx ? { rows, cols, cells: f.cells.filter((c) => c.r < rows && c.c < cols) } : f,
    ),
  }
}

export function setNumber(layout: BusLayout, floorIdx: number, r: number, c: number, number: string): BusLayout {
  return {
    floors: layout.floors.map((f, i) =>
      i === floorIdx ? { ...f, cells: f.cells.map((x) => (x.r === r && x.c === c ? { ...x, number } : x)) } : f,
    ),
  }
}

/** Errores locales básicos (el servidor tiene la última palabra). */
export function layoutProblems(layout: BusLayout) {
  const problems: string[] = []
  const seen = new Set<string>()
  for (const f of layout.floors)
    for (const c of f.cells)
      if (c.type === 'seat') {
        const n = c.number?.trim()
        if (!n) problems.push('Hay un asiento sin número')
        else if (seen.has(n)) problems.push(`El asiento ${n} está repetido`)
        if (n) seen.add(n)
      }
  if (layout.floors.flatMap((f) => f.cells).filter((c) => c.type === 'driver').length > 1)
    problems.push('Solo puede haber un lugar de conductor')
  if (seen.size === 0) problems.push('Agrega al menos un asiento')
  return [...new Set(problems)]
}
