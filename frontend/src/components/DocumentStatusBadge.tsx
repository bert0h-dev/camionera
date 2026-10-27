import type { DocumentStatus } from '../lib/types'

const STYLES: Record<DocumentStatus, string> = {
  valid: 'bg-green-100 text-green-700',
  expiring: 'bg-amber-100 text-amber-800',
  expired: 'bg-red-100 text-red-700',
}

const LABELS: Record<DocumentStatus, string> = {
  valid: 'Vigente',
  expiring: 'Por vencer',
  expired: 'Vencido',
}

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  )
}
