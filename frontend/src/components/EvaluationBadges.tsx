import { EVALUATION_STATUS_LABELS, type EvaluationStatus } from '../lib/types'

const STYLES: Record<EvaluationStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  finalized: 'bg-blue-100 text-blue-800',
  acknowledged: 'bg-emerald-100 text-emerald-800',
}

export function EvaluationStatusBadge({ status }: { status: EvaluationStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STYLES[status]}`}>
      {EVALUATION_STATUS_LABELS[status]}
    </span>
  )
}

/** Promedio 1–5 con color: verde ≥ 4, ámbar ≥ 3, rojo debajo. */
export function ScoreValue({ value }: { value: string | number | null }) {
  if (value == null) return <span className="text-slate-400">—</span>
  const n = Number(value)
  const tone = n >= 4 ? 'text-emerald-700' : n >= 3 ? 'text-amber-700' : 'text-red-700'
  return <span className={`font-semibold ${tone}`}>{n.toFixed(2)}</span>
}
