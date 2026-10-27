import { useState } from 'react'
import { Ban } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { BusLayout, BusSeat } from '../../lib/types'
import { Tabs } from '../../components/ui/Tabs'
import { CELL_ICONS } from './cellIcons'
import { CATEGORY_LABELS, CELL_LABELS, cellAt } from './layout'

const SEAT_TONE = {
  normal:
    'border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-400/40 dark:bg-indigo-500/15 dark:text-indigo-200',
  preferred:
    'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-200',
  accessible: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-400/40 dark:bg-sky-500/15 dark:text-sky-200',
} as const

const BLOCKED =
  'border-red-300 bg-red-50 text-red-700 line-through dark:border-red-400/40 dark:bg-red-500/15 dark:text-red-300'

/** Asientos de una unidad sobre la plantilla del modelo; los bloqueados se ven en rojo. */
export function BusSeatMap({
  layout,
  seats,
  onSeatClick,
}: {
  layout: BusLayout
  seats: BusSeat[]
  onSeatClick?: (seat: BusSeat) => void
}) {
  const [floorIdx, setFloorIdx] = useState(0)
  const floor = layout.floors[Math.min(floorIdx, layout.floors.length - 1)]
  const seatAt = (r: number, c: number) => seats.find((s) => s.floor === floorIdx && s.row === r && s.col === c)

  return (
    <div className="space-y-4">
      {layout.floors.length > 1 && (
        <Tabs
          items={layout.floors.map((_, i) => ({ key: String(i), label: i === 0 ? 'Planta baja' : 'Planta alta' }))}
          value={String(floorIdx)}
          onChange={(k) => setFloorIdx(Number(k))}
        />
      )}
      <div className="overflow-x-auto">
        <div className="mx-auto w-fit rounded-2xl border-2 border-border-strong bg-surface p-3">
          <div className="mb-2 text-center text-[10px] font-semibold tracking-widest text-fg-subtle uppercase">
            Frente
          </div>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${floor.cols}, auto)` }}>
            {Array.from({ length: floor.rows }, (_, r) =>
              Array.from({ length: floor.cols }, (_, c) => {
                const cell = cellAt(floor, r, c)
                const seat = cell?.type === 'seat' ? seatAt(r, c) : undefined
                const base = 'flex size-10 items-center justify-center rounded-md border text-xs sm:size-11'
                if (!seat) {
                  const Icon = cell && cell.type !== 'aisle' && cell.type !== 'seat' ? CELL_ICONS[cell.type] : null
                  return (
                    <div
                      key={`${r}:${c}`}
                      title={cell ? CELL_LABELS[cell.type] : undefined}
                      className={cn(
                        base,
                        Icon ? 'border-border-strong bg-surface-sunken text-fg-muted' : 'border-transparent',
                      )}
                    >
                      {Icon && <Icon className="size-4" />}
                    </div>
                  )
                }
                return (
                  <button
                    key={`${r}:${c}`}
                    type="button"
                    disabled={!onSeatClick}
                    onClick={() => onSeatClick?.(seat)}
                    title={
                      seat.isBlocked
                        ? `Asiento ${seat.number} bloqueado: ${seat.blockReason ?? ''}`
                        : `Asiento ${seat.number} · ${CATEGORY_LABELS[seat.category]}`
                    }
                    className={cn(
                      base,
                      'font-data font-semibold',
                      seat.isBlocked ? BLOCKED : SEAT_TONE[seat.category],
                      onSeatClick ? 'cursor-pointer hover:brightness-95' : 'cursor-default',
                    )}
                  >
                    {seat.isBlocked ? <Ban className="size-4" /> : seat.number}
                  </button>
                )
              }),
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-fg-muted">
        {(['normal', 'preferred', 'accessible'] as const).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={cn('size-3 rounded border', SEAT_TONE[k])} />
            {CATEGORY_LABELS[k]}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className={cn('size-3 rounded border', BLOCKED)} />
          Bloqueado
        </span>
      </div>
    </div>
  )
}
