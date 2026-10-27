import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import { daysLabel, formatDate, staffFullName } from '../../lib/format'
import { STAFF_ROLE_LABELS, type ExpirationItem } from '../../lib/types'
import { useAuth } from '../../auth/useAuth'
import { DocumentStatusBadge } from '../../components/DocumentStatusBadge'
import { Button } from '../../components/ui/Button'
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
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="font-semibold text-slate-800">Documentos del personal por vencer</h2>
          {data && (
            <p className="text-sm text-slate-500">
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
        <p className="px-5 py-6 text-sm text-slate-500">Cargando…</p>
      ) : !data?.items.length ? (
        <p className="px-5 py-6 text-sm text-slate-500">Todo en orden: no hay documentos vencidos ni por vencer.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.items.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              <Link
                to={`/personal/${item.staff.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="font-medium text-slate-800">{staffFullName(item.staff)}</div>
                  <div className="text-xs text-slate-500">
                    {item.staff.employeeNumber} · {STAFF_ROLE_LABELS[item.staff.role]} · {item.label}
                    {item.number && ` (${item.number})`}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <div className="text-xs text-slate-600">
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
