import { cn } from '../lib/cn'
import { EVALUATION_STATUS_LABELS, type EvaluationStatus } from '../lib/types'
import { Badge, type BadgeTone } from './ui/Badge'

const TONES: Record<EvaluationStatus, BadgeTone> = {
  draft: 'neutral',
  finalized: 'primary',
  acknowledged: 'success',
}

export function EvaluationStatusBadge({ status }: { status: EvaluationStatus }) {
  return (
    <Badge tone={TONES[status]} dot>
      {EVALUATION_STATUS_LABELS[status]}
    </Badge>
  )
}

/** Promedio 1–5 con color: verde ≥ 4, ámbar ≥ 3, rojo debajo. */
export function ScoreValue({ value }: { value: string | number | null }) {
  if (value == null) return <span className="text-fg-subtle">—</span>
  const n = Number(value)
  const tone =
    n >= 4
      ? 'text-emerald-600 dark:text-emerald-400'
      : n >= 3
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-red-600 dark:text-red-400'
  return <span className={cn('tabular font-semibold', tone)}>{n.toFixed(2)}</span>
}
