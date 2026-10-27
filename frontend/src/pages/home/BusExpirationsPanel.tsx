import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { daysLabel, formatDate } from '../../lib/format'
import { BUS_DOCUMENT_LABELS, type BusExpiringDocument } from '../../lib/types'
import { DocumentStatusBadge } from '../../components/DocumentStatusBadge'
import { LoadingBlock } from '../../components/ui/Spinner'

/** Seguros, tarjetas, permisos y verificaciones de las unidades vencidos o por vencer. */
export function BusExpirationsPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['fleet', 'buses', 'expiring-documents'],
    queryFn: async () => (await api.get<BusExpiringDocument[]>('/fleet/buses/expiring-documents')).data,
  })
  const expired = data?.filter((d) => d.status === 'expired').length ?? 0

  return (
    <section className="rounded-xl border border-border bg-surface shadow-card">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-semibold text-fg">Documentos de unidades por vencer</h2>
        {data && (
          <p className="text-sm text-fg-muted">
            {expired} vencido(s) · {data.length - expired} por vencer
          </p>
        )}
      </div>
      {isLoading ? (
        <LoadingBlock className="py-6" />
      ) : !data?.length ? (
        <p className="px-5 py-6 text-sm text-fg-muted">Todo en orden: ninguna unidad tiene documentos por vencer.</p>
      ) : (
        <ul className="divide-y divide-border">
          {data.map((d) => (
            <li key={d.id}>
              <Link
                to={`/flota/unidades/${d.bus.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-surface-muted"
              >
                <div className="min-w-0">
                  <div className="font-medium text-fg">
                    Unidad <span className="font-data">{d.bus.economicNumber}</span>
                  </div>
                  <div className="text-xs text-fg-muted">
                    {BUS_DOCUMENT_LABELS[d.type]} · <span className="font-data">{d.folio}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <div className="text-xs text-fg-muted">
                    <div>{formatDate(d.expiryDate)}</div>
                    <div>{daysLabel(d.daysToExpiry)}</div>
                  </div>
                  <DocumentStatusBadge status={d.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
