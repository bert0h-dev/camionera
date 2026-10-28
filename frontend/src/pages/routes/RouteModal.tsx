import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import type { RouteDetail, RouteListItem } from '../../lib/types'
import { utcOffsetLabel, zoneGapLabel } from '../../lib/timezones'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/toast-context'
import { useRouteTerminals } from './useRoutes'

interface Draft {
  code: string
  name: string
  originTerminalId: string
  destinationTerminalId: string
  basePrice: string
  hours: string
  minutes: string
  distanceKm: string
  description: string
}

const toDraft = (r?: RouteListItem | RouteDetail | null): Draft => ({
  code: r?.code ?? '',
  name: r?.name ?? '',
  originTerminalId: r?.originTerminalId ?? '',
  destinationTerminalId: r?.destinationTerminalId ?? '',
  basePrice: r ? String(Number(r.basePrice)) : '',
  hours: r ? String(Math.floor(r.estimatedDurationMinutes / 60)) : '',
  minutes: r ? String(r.estimatedDurationMinutes % 60) : '0',
  distanceKm: r ? String(Number(r.distanceKm)) : '',
  description: r?.description ?? '',
})

/** Alta y edición de una ruta. `route` = null abre el alta; undefined lo cierra. */
export function RouteModal({
  route,
  onClose,
}: {
  route: RouteListItem | RouteDetail | null | undefined
  onClose: () => void
}) {
  const open = route !== undefined
  const editing = !!route
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const terminals = useRouteTerminals(open)
  const [draft, setDraft] = useState<Draft>(() => toDraft(route))
  const [prevRoute, setPrevRoute] = useState(route)
  if (prevRoute !== route) {
    setPrevRoute(route)
    setDraft(toDraft(route))
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const list = terminals.data ?? []
  const byId = (id: string) => list.find((t) => t.id === id)
  const origin = byId(draft.originTerminalId)
  const destination = byId(draft.destinationTerminalId)
  const crossesZone = !!origin && !!destination && origin.city.timezone !== destination.city.timezone
  const sameTerminal = !!draft.originTerminalId && draft.originTerminalId === draft.destinationTerminalId

  // Al elegir los extremos se propone un nombre si el campo sigue vacío
  const suggestName = (o = origin, d = destination) =>
    !draft.name && o && d ? { name: `${o.city.name} – ${d.city.name}` } : {}

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        code: draft.code,
        name: draft.name,
        originTerminalId: draft.originTerminalId,
        destinationTerminalId: draft.destinationTerminalId,
        basePrice: Number(draft.basePrice),
        estimatedDurationMinutes: Number(draft.hours || 0) * 60 + Number(draft.minutes || 0),
        distanceKm: Number(draft.distanceKm),
        description: draft.description || null,
      }
      return route
        ? (await api.patch<RouteDetail>(`/routes/${route.id}`, body)).data
        : (await api.post<RouteDetail>('/routes', body)).data
    },
    onSuccess: (saved) => {
      toast.success(editing ? 'Ruta actualizada' : 'Ruta creada')
      queryClient.invalidateQueries({ queryKey: ['routes'] })
      onClose()
      if (!editing) navigate(`/rutas/${saved.id}`)
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  // Las terminales desactivadas o sin ubicación no salen en la lista; al editar se conserva la actual
  const options = (currentId: string) => {
    const current = route && !byId(currentId) ? [route.originTerminal, route.destinationTerminal] : []
    return [...list, ...current.filter((t) => t.id === currentId)]
  }

  return (
    <Modal open={open} title={editing ? `Editar ruta ${route?.code}` : 'Nueva ruta'} size="lg" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <Input
            label="Clave"
            required
            maxLength={20}
            placeholder="GDL-MEX-01"
            className="font-data uppercase"
            value={draft.code}
            onChange={(e) => set({ code: e.target.value.toUpperCase() })}
          />
          <Input label="Nombre" required value={draft.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {(['originTerminalId', 'destinationTerminalId'] as const).map((field) => (
            <Select
              key={field}
              label={field === 'originTerminalId' ? 'Terminal de origen' : 'Terminal de destino'}
              required
              value={draft[field]}
              error={sameTerminal && field === 'destinationTerminalId' ? 'Debe ser distinta del origen' : undefined}
              onChange={(e) => {
                const t = byId(e.target.value)
                set({
                  [field]: e.target.value,
                  ...(field === 'originTerminalId' ? suggestName(t, destination) : suggestName(origin, t)),
                })
              }}
            >
              <option value="">Selecciona…</option>
              {options(draft[field]).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} · {t.city.name} ({utcOffsetLabel(t.city.timezone)})
                </option>
              ))}
            </Select>
          ))}
        </div>
        {terminals.data && list.length < 2 && (
          <Alert tone="warning">
            Se necesitan al menos dos terminales activas con ubicación. Márcalas en Flota › Catálogos.
          </Alert>
        )}
        {crossesZone && (
          <Alert tone="info">
            La ruta une dos zonas horarias distintas:{' '}
            {zoneGapLabel(origin.city.timezone, destination.city.timezone, destination.city.name)}. Las salidas se
            capturan en hora de {origin.city.name} y las llegadas se mostrarán en hora de {destination.city.name}.
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-4">
          <Input
            label="Precio base"
            required
            type="number"
            min={1}
            step="0.01"
            hint="Boleto completo, MXN"
            value={draft.basePrice}
            onChange={(e) => set({ basePrice: e.target.value })}
          />
          <Input
            label="Distancia"
            required
            type="number"
            min={1}
            step="0.1"
            hint="km"
            value={draft.distanceKm}
            onChange={(e) => set({ distanceKm: e.target.value })}
          />
          <Input
            label="Duración (h)"
            required
            type="number"
            min={0}
            max={72}
            value={draft.hours}
            onChange={(e) => set({ hours: e.target.value })}
          />
          <Input
            label="Minutos"
            type="number"
            min={0}
            max={59}
            value={draft.minutes}
            onChange={(e) => set({ minutes: e.target.value })}
          />
        </div>
        <Textarea
          label="Descripción"
          rows={2}
          value={draft.description}
          onChange={(e) => set({ description: e.target.value })}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending} disabled={sameTerminal}>
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
