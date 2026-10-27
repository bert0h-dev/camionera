import { Armchair, Bath, ChevronsUp, CircleDot, Coffee, DoorOpen, MoveVertical, type LucideIcon } from 'lucide-react'
import type { CellType } from '../../lib/types'

/** Ícono de cada tipo de celda de la plantilla de asientos. */
export const CELL_ICONS: Record<CellType, LucideIcon> = {
  seat: Armchair,
  aisle: MoveVertical,
  bathroom: Bath,
  stairs: ChevronsUp,
  driver: CircleDot,
  door: DoorOpen,
  cafe: Coffee,
}
