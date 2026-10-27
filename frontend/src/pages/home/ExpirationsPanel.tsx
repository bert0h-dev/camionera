import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import { daysLabel, formatDate, staffFullName } from '../../lib/format'
import { STAFF_ROLE_LABELS, type ExpirationItem } from '../../lib/types'
import { useAuth } from '../../auth/useAuth'
import { DocumentStatusBadge } from '../../components/DocumentStatusBadge'
import { Button } from '../../components/ui/Button'
import { LoadingBlock } from '../../components/ui/Spinner'
import { Input } from '../../components/ui/Field'
import { useToast } from '../../components/ui/toast-context'

const ALERT_DAYS_KEY = 'documents.expiry_alert_days'

function AlertDaysEditor({ current, onDone }: { current: number; onDone: () => void }) {
  const [value, setValue] = useState(String(current))
  const toast = useToast()
  const queryClient = useQueryClient()

  const save = useMutation({
    mutationFn: () => api.patch(`/settings/${ALERT_DAYS_KEY}`, { value: Number(value) }),
    onSuccess: () => {
      toast.success('Días de alerta actualizados')
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      onDone()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <Input
        label="Días de anticipación"
        type="number"
        min={1}
        max={365}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-28"
      />
      <Button type="submit" loading={save.isPending}>
        Guardar
      </Button>
      <Button variant="ghost" onClick={onDone}>
        Cancelar
      </Button>
    </form>
  )
}

export function ExpirationsPanel() {
  const { user } = useAuth()
  const [editing, setEditing] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['staff', 'expirations'],
    queryFn: async () => (await api.get<{ alertDays: number; items: ExpirationItem[] }>('/staff/expirations')).data,
  })

  const expired = data?.items.filter((i) => i.status === 'expired').length ?? 0
  const expiring = (data?.items.length ?? 0) - expired

  return (
    <section className="rounded-xl border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-semibold text-fg">Documentos del personal por vencer</h2>
          {data && (
            <p className="text-sm text-fg-muted">
              {expired} vencido(s) · {expiring} por vencer en los próximos {data.alertDays} días
            </p>
          )}
        </div>
        {user?.role === 'admin' &&
          data &&
          (editing ? (
            <AlertDaysEditor current={data.alertDays} onDone={() => setEditing(false)} />
          ) : (
            <Button variant="ghost" onClick={() => setEditing(true)}>
              Configurar alerta
            </Button>
          ))}
      </div>

      {isLoading ? (
        <LoadingBlock className="py-6" />
      ) : !data?.items.length ? (
        <p className="px-5 py-6 text-sm text-fg-muted">Todo en orden: no hay documentos vencidos ni por vencer.</p>
      ) : (
        <ul className="divide-y divide-border">
          {data.items.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              <Link
                to={`/personal/${item.staff.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-surface-muted"
              >
                <div className="min-w-0">
                  <div className="font-medium text-fg">{staffFullName(item.staff)}</div>
                  <div className="text-xs text-fg-muted">
                    {item.staff.employeeNumber} · {STAFF_ROLE_LABELS[item.staff.role]} · {item.label}
                    {item.number && ` (${item.number})`}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <div className="text-xs text-fg-muted">
                    <div>{formatDate(item.expiryDate)}</div>
                    <div>{daysLabel(item.daysToExpiry)}</div>
                  </div>
                  <DocumentStatusBadge status={item.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
