import { useState } from 'react'
import {
  Armchair,
  Bath,
  ChevronsUp,
  CircleDot,
  Coffee,
  DoorOpen,
  ListOrdered,
  MousePointer2,
  MoveVertical,
  Plus,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import {
  CELL_TYPES,
  SEAT_CATEGORIES,
  type BusLayout,
  type CellType,
  type LayoutCell,
  type SeatCategory,
} from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { Tabs } from '../../components/ui/Tabs'
import { CATEGORY_LABELS, CELL_LABELS, LIMITS, cellAt, paintCell, renumber, resizeFloor, setNumber } from './layout'

type Brush = CellType | 'empty' | 'select'

const CELL_ICONS: Record<CellType, LucideIcon> = {
  seat: Armchair,
  aisle: MoveVertical,
  bathroom: Bath,
  stairs: ChevronsUp,
  driver: CircleDot,
  door: DoorOpen,
  cafe: Coffee,
}

const SEAT_TONE: Record<SeatCategory, string> = {
  normal:
    'border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-400/40 dark:bg-indigo-500/15 dark:text-indigo-200',
  preferred:
    'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-200',
  accessible: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-400/40 dark:bg-sky-500/15 dark:text-sky-200',
}

const OTHER_TONE = 'border-border-strong bg-surface-sunken text-fg-muted'

/** Una celda de la cuadrícula, editable o solo de lectura. */
function Cell({
  cell,
  selected,
  onPaint,
  onEnter,
}: {
  cell?: LayoutCell
  selected?: boolean
  onPaint?: () => void
  onEnter?: () => void
}) {
  const base = 'flex size-10 items-center justify-center rounded-md border text-xs select-none sm:size-11'
  const Icon = cell && cell.type !== 'seat' && cell.type !== 'aisle' ? CELL_ICONS[cell.type] : null
  return (
    <button
      type="button"
      tabIndex={onPaint ? 0 : -1}
      title={cell ? (cell.type === 'seat' ? `Asiento ${cell.number}` : CELL_LABELS[cell.type]) : 'Vacío'}
      onMouseDown={(e) => {
        e.preventDefault()
        onPaint?.()
      }}
      onMouseEnter={onEnter}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPaint?.()}
      className={cn(
        base,
        !cell && 'border-dashed border-border bg-transparent',
        cell?.type === 'seat' && SEAT_TONE[cell.category ?? 'normal'],
        cell?.type === 'aisle' && 'border-transparent bg-transparent',
        cell && cell.type !== 'seat' && cell.type !== 'aisle' && OTHER_TONE,
        selected && 'ring-2 ring-primary ring-offset-1 ring-offset-surface',
        onPaint ? 'cursor-pointer hover:brightness-95' : 'cursor-default',
      )}
    >
      {cell?.type === 'seat' && <span className="font-data font-semibold">{cell.number}</span>}
      {Icon && <Icon className="size-4" />}
    </button>
  )
}

export function LayoutEditor({
  layout,
  onChange,
  maxFloors,
  readOnly,
}: {
  layout: BusLayout
  onChange: (layout: BusLayout) => void
  maxFloors: 1 | 2
  readOnly?: boolean
}) {
  const [floorIdx, setFloorIdx] = useState(0)
  const [brush, setBrush] = useState<Brush>('seat')
  const [category, setCategory] = useState<SeatCategory>('normal')
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  const current = Math.min(floorIdx, layout.floors.length - 1)
  const floor = layout.floors[current]
  const selectedCell = selected ? cellAt(floor, selected.r, selected.c) : undefined

  const paint = (r: number, c: number) => {
    if (brush === 'select') {
      setSelected({ r, c })
      return
    }
    onChange(paintCell(layout, current, r, c, brush, category))
  }

  const brushes: { key: Brush; label: string; icon: LucideIcon }[] = [
    { key: 'select', label: 'Seleccionar', icon: MousePointer2 },
    ...CELL_TYPES.filter((t) => t !== 'stairs' || maxFloors === 2).map((t) => ({
      key: t,
      label: CELL_LABELS[t],
      icon: CELL_ICONS[t],
    })),
    { key: 'empty', label: 'Borrar', icon: Trash2 },
  ]

  const grid = (
    <div className="overflow-x-auto">
      <div
        className="mx-auto w-fit rounded-2xl border-2 border-border-strong bg-surface p-3"
        onMouseLeave={() => setDragging(false)}
        onMouseUp={() => setDragging(false)}
      >
        <div className="mb-2 text-center text-[10px] font-semibold tracking-widest text-fg-subtle uppercase">
          Frente
        </div>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${floor.cols}, auto)` }}>
          {Array.from({ length: floor.rows }, (_, r) =>
            Array.from({ length: floor.cols }, (_, c) => (
              <Cell
                key={`${r}:${c}`}
                cell={cellAt(floor, r, c)}
                selected={brush === 'select' && selected?.r === r && selected?.c === c}
                onPaint={
                  readOnly
                    ? undefined
                    : () => {
                        setDragging(brush !== 'select')
                        paint(r, c)
                      }
                }
                onEnter={readOnly || !dragging ? undefined : () => paint(r, c)}
              />
            )),
          )}
        </div>
      </div>
    </div>
  )

  const floorTabs = layout.floors.length > 1 && (
    <Tabs
      items={layout.floors.map((_, i) => ({ key: String(i), label: i === 0 ? 'Planta baja' : 'Planta alta' }))}
      value={String(current)}
      onChange={(k) => {
        setFloorIdx(Number(k))
        setSelected(null)
      }}
    />
  )

  if (readOnly)
    return (
      <div className="space-y-4">
        {floorTabs}
        {grid}
        <Legend />
      </div>
    )

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
      <div className="space-y-4">
        {floorTabs}
        {grid}
        <Legend />
      </div>

      <div className="space-y-5">
        <div>
          <div className="mb-2 text-xs font-semibold text-fg-muted uppercase">Herramienta</div>
          <div className="grid grid-cols-2 gap-1.5">
            {brushes.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => setBrush(b.key)}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm',
                  brush === b.key
                    ? 'border-primary bg-primary-soft text-primary-soft-fg'
                    : 'border-border text-fg-muted hover:bg-surface-muted',
                )}
              >
                <b.icon className="size-4 shrink-0" />
                {b.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-fg-muted">
            Haz clic o arrastra sobre la cuadrícula. Pintar de nuevo el mismo tipo deja la celda vacía.
          </p>
        </div>

        {brush === 'seat' && (
          <div>
            <div className="mb-2 text-xs font-semibold text-fg-muted uppercase">Categoría del asiento</div>
            <div className="flex flex-wrap gap-1.5">
              {SEAT_CATEGORIES.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setCategory(k)}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-sm',
                    SEAT_TONE[k],
                    category === k && 'ring-2 ring-primary ring-offset-1 ring-offset-surface',
                  )}
                >
                  {CATEGORY_LABELS[k]}
                </button>
              ))}
            </div>
          </div>
        )}

        {brush === 'select' && (
          <div className="rounded-lg border border-border p-3 text-sm">
            {selectedCell?.type === 'seat' ? (
              <Input
                label="Número del asiento"
                className="font-data"
                maxLength={6}
                value={selectedCell.number ?? ''}
                onChange={(e) => onChange(setNumber(layout, current, selectedCell.r, selectedCell.c, e.target.value))}
              />
            ) : (
              <span className="text-fg-muted">
                {selectedCell ? CELL_LABELS[selectedCell.type] : 'Selecciona un asiento para cambiar su número'}
              </span>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Filas"
            type="number"
            min={LIMITS.minRows}
            max={LIMITS.maxRows}
            value={floor.rows}
            onChange={(e) => {
              const rows = Math.min(LIMITS.maxRows, Math.max(LIMITS.minRows, Number(e.target.value) || 1))
              onChange(resizeFloor(layout, current, rows, floor.cols))
            }}
          />
          <Input
            label="Columnas"
            type="number"
            min={LIMITS.minCols}
            max={LIMITS.maxCols}
            value={floor.cols}
            onChange={(e) => {
              const cols = Math.min(LIMITS.maxCols, Math.max(LIMITS.minCols, Number(e.target.value) || 2))
              onChange(resizeFloor(layout, current, floor.rows, cols))
            }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Button variant="secondary" icon={ListOrdered} onClick={() => onChange(renumber(layout))}>
            Renumerar asientos
          </Button>
          {maxFloors === 2 && layout.floors.length === 1 && (
            <Button
              variant="secondary"
              icon={Plus}
              onClick={() => {
                onChange({ floors: [...layout.floors, { rows: floor.rows, cols: floor.cols, cells: [] }] })
                setFloorIdx(1)
              }}
            >
              Agregar planta alta
            </Button>
          )}
          {layout.floors.length === 2 && current === 1 && (
            <Button
              variant="ghost"
              icon={Trash2}
              onClick={() => {
                onChange(renumber({ floors: [layout.floors[0]] }))
                setFloorIdx(0)
              }}
            >
              Quitar planta alta
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-fg-muted">
      {SEAT_CATEGORIES.map((k) => (
        <span key={k} className="flex items-center gap-1.5">
          <span className={cn('size-3 rounded border', SEAT_TONE[k])} />
          {CATEGORY_LABELS[k]}
        </span>
      ))}
      {(['driver', 'door', 'bathroom', 'stairs', 'cafe'] as const).map((t) => {
        const Icon = CELL_ICONS[t]
        return (
          <span key={t} className="flex items-center gap-1">
            <Icon className="size-3.5" />
            {CELL_LABELS[t]}
          </span>
        )
      })}
    </div>
  )
}
