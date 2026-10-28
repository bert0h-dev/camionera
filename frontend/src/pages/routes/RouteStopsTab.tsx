import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, MapPinned, Pencil, Plus, Trash2 } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { cn } from '../../lib/cn'
import { formatMinutes, formatMoney, todayKey } from '../../lib/format'
import { arrivalLabel, utcOffsetLabel } from '../../lib/timezones'
import type { RouteDetail, RouteScheduleRow, RouteTerminal } from '../../lib/types'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Input, Select } from '../../components/ui/Field'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/toast-context'
import { formatKm, useCanEditRoutes, useRouteTerminals } from './useRoutes'

/** Un punto del itinerario: origen, parada o destino, con sus acumulados desde el origen. */
interface Point {
  key: string
  label: string
  terminal: RouteTerminal
  km: number | null
  minutes: number
  price: number
}

function itinerary(route: RouteDetail): Point[] {
  return [
    { key: 'origin', label: 'Origen', terminal: route.originTerminal, km: 0, minutes: 0, price: 0 },
    ...route.stops.map((s) => ({
      key: s.id,
      label: `Parada ${s.stopOrder}`,
      terminal: s.terminal,
      km: Number(s.kmFromOrigin),
      minutes: s.durationFromOriginMinutes,
      price: Number(s.priceFromOrigin),
    })),
    {
      key: 'destination',
      label: 'Destino',
      terminal: route.destinationTerminal,
      km: route.distanceKm === null ? null : Number(route.distanceKm),
      minutes: route.estimatedDurationMinutes,
      price: Number(route.basePrice),
    },
  ]
}

/** Precio de cada tramo: fila = donde sube, columna = donde baja (diferencia de precios acumulados). */
function FareMatrix({ points }: { points: Point[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-fg-muted">
            <th className="px-2 py-1.5 text-left font-medium">Sube ↓ · Baja →</th>
            {points.slice(1).map((p) => (
              <th key={p.key} className="px-2 py-1.5 text-right font-data font-medium">
                {p.terminal.code}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.slice(0, -1).map((from, i) => (
            <tr key={from.key} className="border-t border-border">
              <th className="px-2 py-1.5 text-left font-data font-medium">{from.terminal.code}</th>
              {points.slice(1).map((to, j) => (
                <td key={to.key} className="px-2 py-1.5 text-right font-data">
                  {j >= i ? formatMoney(to.price - from.price) : <span className="text-fg-subtle">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface DraftStop {
  terminalId: string
  legKm: string
  hours: string
  minutes: string
  price: string
}

const toDraft = (route: RouteDetail): { stops: DraftStop[]; finalLegKm: string } => {
  let prevKm = 0
  const stops = route.stops.map((s) => {
    const km = Number(s.kmFromOrigin)
    const leg = Math.round((km - prevKm) * 100) / 100
    prevKm = km
    return {
      terminalId: s.terminal.id,
      legKm: String(leg),
      hours: String(Math.floor(s.durationFromOriginMinutes / 60)),
      minutes: String(s.durationFromOriginMinutes % 60),
      price: String(Number(s.priceFromOrigin)),
    }
  })
  const total = route.distanceKm === null ? null : Number(route.distanceKm)
  return {
    stops,
    finalLegKm: total === null ? '' : String(Math.round((total - prevKm) * 100) / 100),
  }
}

/** Editor del itinerario: cada fila es un tramo "de X a Y"; se guarda completo. */
function StopsEditor({ route, onDone }: { route: RouteDetail; onDone: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const terminals = useRouteTerminals()
  const [draft, setDraft] = useState(() => toDraft(route))
  const setStop = (i: number, patch: Partial<DraftStop>) =>
    setDraft((d) => ({ ...d, stops: d.stops.map((s, j) => (j === i ? { ...s, ...patch } : s)) }))
  const move = (i: number, to: number) =>
    setDraft((d) => {
      const stops = [...d.stops]
      ;[stops[i], stops[to]] = [stops[to], stops[i]]
      return { ...d, stops }
    })

  const options = (terminals.data ?? []).filter(
    (t) => t.id !== route.originTerminal.id && t.id !== route.destinationTerminal.id,
  )
  // Las terminales ya usadas que dejaron de estar en la lista (desactivadas) se conservan
  const known = new Map<string, { id: string; code: string; city: { name: string } }>(
    [...route.stops.map((s) => s.terminal), ...options].map((t) => [t.id, t]),
  )
  const nameOf = (id: string) => (known.get(id) ? `${known.get(id)!.code} · ${known.get(id)!.city.name}` : '—')

  const legs = draft.stops.map((s) => Number(s.legKm) || 0)
  const totalKm = legs.reduce((a, b) => a + b, 0) + (Number(draft.finalLegKm) || 0)
  const cumulative = legs.map((_, i) => legs.slice(0, i + 1).reduce((a, b) => a + b, 0))

  const save = useMutation({
    mutationFn: () =>
      api.put(`/routes/${route.id}/stops`, {
        stops: draft.stops.map((s) => ({
          terminalId: s.terminalId,
          legKm: Number(s.legKm),
          durationFromOriginMinutes: Number(s.hours || 0) * 60 + Number(s.minutes || 0),
          priceFromOrigin: Number(s.price),
        })),
        finalLegKm: draft.finalLegKm ? Number(draft.finalLegKm) : null,
      }),
    onSuccess: () => {
      toast.success('Itinerario guardado')
      queryClient.invalidateQueries({ queryKey: ['routes'] })
      onDone()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const from = (i: number) =>
    i === 0 ? route.originTerminal.code : (known.get(draft.stops[i - 1].terminalId)?.code ?? '…')

  return (
    <Card>
      <CardHeader
        title="Editar itinerario"
        description="Captura los km de cada tramo, el tiempo desde la salida y el precio del boleto desde el origen hasta cada parada"
      />
      <CardBody className="space-y-4">
        <form
          id="stops-form"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          {draft.stops.map((s, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">
                  Parada {i + 1}{' '}
                  <span className="font-normal text-fg-muted">
                    · tramo {from(i)} → {s.terminalId ? known.get(s.terminalId)?.code : '…'}
                  </span>
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    icon={ArrowUp}
                    aria-label="Subir"
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    icon={ArrowDown}
                    aria-label="Bajar"
                    disabled={i === draft.stops.length - 1}
                    onClick={() => move(i, i + 1)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    icon={Trash2}
                    aria-label="Quitar parada"
                    onClick={() => setDraft((d) => ({ ...d, stops: d.stops.filter((_, j) => j !== i) }))}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
                <Select
                  label="Terminal"
                  required
                  value={s.terminalId}
                  onChange={(e) => setStop(i, { terminalId: e.target.value })}
                >
                  <option value="">Selecciona…</option>
                  {[...known.values()]
                    .filter((t) => t.id === s.terminalId || !draft.stops.some((x) => x.terminalId === t.id))
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {nameOf(t.id)}
                      </option>
                    ))}
                </Select>
                <Input
                  label="Km del tramo"
                  required
                  type="number"
                  min={0.1}
                  step="0.1"
                  hint={`${formatKm(cumulative[i])} desde el origen`}
                  value={s.legKm}
                  onChange={(e) => setStop(i, { legKm: e.target.value })}
                />
                <Input
                  label="Horas desde la salida"
                  required
                  type="number"
                  min={0}
                  value={s.hours}
                  onChange={(e) => setStop(i, { hours: e.target.value })}
                />
                <Input
                  label="Minutos"
                  type="number"
                  min={0}
                  max={59}
                  value={s.minutes}
                  onChange={(e) => setStop(i, { minutes: e.target.value })}
                />
                <Input
                  label="Precio desde origen"
                  required
                  type="number"
                  min={1}
                  step="0.01"
                  value={s.price}
                  onChange={(e) => setStop(i, { price: e.target.value })}
                />
              </div>
            </div>
          ))}
          <Button
            variant="secondary"
            size="sm"
            icon={Plus}
            onClick={() =>
              setDraft((d) => ({
                ...d,
                stops: [...d.stops, { terminalId: '', legKm: '', hours: '', minutes: '0', price: '' }],
              }))
            }
          >
            Agregar parada
          </Button>

          <div className="grid gap-3 rounded-lg bg-surface-sunken p-3 sm:grid-cols-[2fr_1fr_2fr]">
            <div className="text-sm">
              <div className="font-semibold">Último tramo</div>
              <div className="text-fg-muted">
                {draft.stops.length ? from(draft.stops.length) : route.originTerminal.code} →{' '}
                {route.destinationTerminal.code} (destino)
              </div>
            </div>
            <Input
              label="Km del tramo"
              required={draft.stops.length > 0}
              type="number"
              min={0.1}
              step="0.1"
              hint={draft.stops.length ? undefined : 'Opcional sin paradas'}
              value={draft.finalLegKm}
              onChange={(e) => setDraft((d) => ({ ...d, finalLegKm: e.target.value }))}
            />
            <div className="text-sm sm:text-right">
              <div className="text-xs text-fg-muted">Distancia total de la ruta</div>
              <div className="font-data text-lg font-semibold">
                {draft.finalLegKm || !draft.stops.length ? formatKm(totalKm || null) : '—'}
              </div>
              <div className="text-xs text-fg-muted">
                Llega al destino en {formatMinutes(route.estimatedDurationMinutes)} por {formatMoney(route.basePrice)}
              </div>
            </div>
          </div>
        </form>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onDone}>
            Descartar
          </Button>
          <Button type="submit" form="stops-form" loading={save.isPending}>
            Guardar itinerario
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}

export function RouteStopsTab({ route, schedules }: { route: RouteDetail; schedules: RouteScheduleRow[] }) {
  const canEdit = useCanEditRoutes()
  const [editing, setEditing] = useState(false)
  const departures = [...new Set(schedules.filter((s) => s.status === 'current').map((s) => s.departureTime))].sort()
  const [departure, setDeparture] = useState('')
  const shown = departure || departures[0] || ''

  if (editing) return <StopsEditor route={route} onDone={() => setEditing(false)} />

  const points = itinerary(route)
  const originTz = route.originTerminal.city.timezone
  const today = todayKey()

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <Card>
        <CardHeader
          title="Itinerario"
          description="Tiempo, distancia y precio acumulados desde el origen; la hora es la local de cada terminal"
          actions={
            <>
              {departures.length > 0 && (
                <Select
                  aria-label="Salida"
                  value={shown}
                  onChange={(e) => setDeparture(e.target.value)}
                  className="w-44"
                >
                  {departures.map((d) => (
                    <option key={d} value={d}>
                      Salida de las {d}
                    </option>
                  ))}
                </Select>
              )}
              {canEdit && (
                <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
                  Editar
                </Button>
              )}
            </>
          }
        />
        <CardBody>
          <ol className="relative">
            {points.map((p, i) => {
              const last = i === points.length - 1
              const end = i === 0 || last
              return (
                <li key={p.key} className="relative flex gap-4 pb-5 last:pb-0">
                  {!last && <span className="absolute top-6 left-[11px] h-full w-0.5 bg-border" aria-hidden />}
                  <span
                    className={cn(
                      'relative z-10 mt-1 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold',
                      end ? 'bg-primary text-primary-fg' : 'bg-primary-soft text-primary-soft-fg ring-2 ring-surface',
                    )}
                  >
                    {i === 0 ? 'O' : last ? 'D' : i}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <div className="min-w-0">
                      <div className="text-xs text-fg-muted">{p.label}</div>
                      <div className="font-medium">
                        <span className="font-data">{p.terminal.code}</span> · {p.terminal.city.name}
                      </div>
                      <div className="text-xs text-fg-muted">
                        {p.terminal.name} · {utcOffsetLabel(p.terminal.city.timezone)}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-right text-sm">
                      <div>
                        <div className="text-xs text-fg-muted">{i === 0 ? 'Sale' : 'Llega'}</div>
                        <div className="font-data font-semibold">
                          {shown
                            ? arrivalLabel(shown, p.minutes, originTz, p.terminal.city.timezone, today)
                            : i === 0
                              ? '—'
                              : `+${formatMinutes(p.minutes)}`}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-fg-muted">Km</div>
                        <div className="font-data">{formatKm(p.km)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-fg-muted">Precio</div>
                        <div className="font-data">{i === 0 ? '—' : formatMoney(p.price)}</div>
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
          {!route.stops.length && (
            <div className="mt-4">
              <EmptyState
                icon={MapPinned}
                title="Ruta directa"
                description={
                  canEdit
                    ? 'Agrega paradas para vender boletos por tramo; la distancia se calculará con los km de cada tramo.'
                    : 'Esta ruta no tiene paradas intermedias.'
                }
              />
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Precio por tramo"
          description="Lo que paga quien sube en un punto y baja en otro: la diferencia de los precios desde el origen"
        />
        <CardBody>
          {route.stops.length ? (
            <FareMatrix points={points} />
          ) : (
            <Alert tone="info">
              Sin paradas, el único tramo es el boleto completo de {formatMoney(route.basePrice)}.
            </Alert>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
