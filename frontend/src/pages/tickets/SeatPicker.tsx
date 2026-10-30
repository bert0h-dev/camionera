import { Ban, Check, Lock, User } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { BusLayout, TripSeatMap } from '../../lib/types'
import { BusSeatMap, type SeatLook } from '../fleet/BusSeatMap'
import { CATEGORY_LABELS } from '../fleet/layout'

type Seat = TripSeatMap['seats'][number]

const LOOK = {
  free: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200',
  selected: 'border-indigo-600 bg-indigo-600 text-white dark:border-indigo-400 dark:bg-indigo-500',
  mine: 'border-indigo-400 bg-indigo-100 text-indigo-800 dark:border-indigo-400/60 dark:bg-indigo-500/25 dark:text-indigo-100',
  held: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-300',
  occupied: 'border-border-strong bg-surface-sunken text-fg-subtle',
  blocked:
    'border-red-300 bg-red-50 text-red-700 line-through dark:border-red-400/40 dark:bg-red-500/15 dark:text-red-300',
} as const

const LEGEND: [keyof typeof LOOK, string][] = [
  ['free', 'Libre'],
  ['selected', 'Seleccionado'],
  ['mine', 'Apartado por ti'],
  ['held', 'Apartado por otro vendedor'],
  ['occupied', 'Vendido'],
  ['blocked', 'Bloqueado'],
]

/** Mapa de asientos para vender: libre, apartado, vendido o bloqueado en el tramo elegido. */
export function SeatPicker({
  layout,
  seats,
  selected,
  onToggle,
  disabled,
}: {
  layout: BusLayout
  seats: Seat[]
  selected: string[]
  onToggle: (number: string) => void
  disabled?: boolean
}) {
  const look = (s: Seat): SeatLook => {
    const extra = s.category !== 'normal' ? ` · ${CATEGORY_LABELS[s.category]}` : ''
    if (selected.includes(s.number))
      return {
        className: LOOK.selected,
        title: `Asiento ${s.number} seleccionado${extra}`,
        content: <Check className="size-4" />,
      }
    switch (s.state) {
      case 'free':
        return { className: LOOK.free, title: `Asiento ${s.number} libre${extra}`, disabled }
      case 'held':
        return s.heldOrderId
          ? { className: LOOK.mine, title: `Asiento ${s.number} apartado por ti`, disabled: true }
          : {
              className: LOOK.held,
              title: `Asiento ${s.number} apartado por otro vendedor`,
              disabled: true,
              content: <Lock className="size-3.5" />,
            }
      case 'occupied':
        return {
          className: LOOK.occupied,
          title: `Asiento ${s.number} vendido en este tramo`,
          disabled: true,
          content: <User className="size-4" />,
        }
      default:
        return {
          className: LOOK.blocked,
          title: `Asiento ${s.number} bloqueado${s.blockReason ? `: ${s.blockReason}` : ''}`,
          disabled: true,
          content: <Ban className="size-4" />,
        }
    }
  }

  return (
    <BusSeatMap
      layout={layout}
      seats={seats}
      seatLook={look}
      onSeatClick={(s) => onToggle(s.number)}
      legend={
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-fg-muted">
          {LEGEND.map(([k, label]) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={cn('size-3 rounded border', LOOK[k])} />
              {label}
            </span>
          ))}
        </div>
      }
    />
  )
}
