import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import { addDaysKey, todayKey } from '../../lib/format'
import type { GenerateTripsResult, TripSummary } from '../../lib/types'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/toast-context'
import { useTripRouteOptions } from './useTrips'

/** Generación manual de un rango; la automática corre cada noche para el horizonte configurado. */
export function GenerateTripsModal({
  open,
  summary,
  onClose,
}: {
  open: boolean
  summary: TripSummary | undefined
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const routes = useTripRouteOptions()
  const [from, setFrom] = useState(todayKey())
  const [to, setTo] = useState(() => summary?.horizon.to ?? addDaysKey(todayKey(), 13))
  const [routeId, setRouteId] = useState('')
  const [result, setResult] = useState<GenerateTripsResult | null>(null)

  const close = () => {
    setResult(null)
    onClose()
  }

  const generate = useMutation({
    mutationFn: async () =>
      (await api.post<GenerateTripsResult>('/trips/generate', { from, to, routeId: routeId || undefined })).data,
    onSuccess: (r) => {
      setResult(r)
      queryClient.invalidateQueries({ queryKey: ['trips'] })
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  return (
    <Modal
      open={open}
      title="Generar recorridos"
      description="Crea las salidas que faltan según los horarios vigentes; no duplica las que ya existen"
      onClose={close}
    >
      {result ? (
        <div className="space-y-4">
          <Alert tone="info">
            Del <span className="font-data">{result.from}</span> al <span className="font-data">{result.to}</span>:{' '}
            {result.created === 0 ? 'no faltaba ningún recorrido' : `${result.created} recorridos nuevos`}
            {result.removed > 0 && `, ${result.removed} quitados porque su horario cambió`}.
          </Alert>
          {result.stale > 0 && (
            <Alert tone="warning">
              {result.stale} recorridos asignados ya no coinciden con su horario. Revísalos antes de la salida.
            </Alert>
          )}
          <div className="flex justify-end">
            <Button onClick={close}>Listo</Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            generate.mutate()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Desde"
              type="date"
              required
              min={todayKey()}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <Input
              label="Hasta"
              type="date"
              required
              min={from}
              max={addDaysKey(from, 61)}
              hint="Hasta 62 días a la vez"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <Select label="Ruta" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            <option value="">Todas las rutas activas</option>
            {routes.data
              ?.filter((r) => r.isActive)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} · {r.name}
                </option>
              ))}
          </Select>
          {summary && (
            <p className="text-xs text-fg-muted">
              Cada noche se generan solos hasta el <span className="font-data">{summary.horizon.to}</span>
              {summary.generatedUntil && (
                <>
                  {' '}
                  · ya hay recorridos hasta el <span className="font-data">{summary.generatedUntil}</span>
                </>
              )}
              .
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" loading={generate.isPending} disabled={!from || !to || to < from}>
              Generar
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
