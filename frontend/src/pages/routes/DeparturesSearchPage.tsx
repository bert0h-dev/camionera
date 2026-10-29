import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, ArrowRight, ChevronDown, Search, SearchX, TicketCheck } from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { addDaysKey, dayLabel, formatMinutes, formatMoney, todayKey } from '../../lib/format'
import type { DepartureResult, DepartureSearch } from '../../lib/types'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardBody } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input, Select } from '../../components/ui/Field'
import { FilterBar } from '../../components/ui/FilterBar'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingBlock } from '../../components/ui/Spinner'
import { formatPercent, useRoute } from './useRoutes'

const SLOTS = {
  '': { label: 'Cualquier hora' },
  early: { label: 'Madrugada (00–06)', from: '00:00', to: '05:59' },
  morning: { label: 'Mañana (06–12)', from: '06:00', to: '11:59' },
  afternoon: { label: 'Tarde (12–19)', from: '12:00', to: '18:59' },
  night: { label: 'Noche (19–24)', from: '19:00', to: '23:59' },
} as const
type Slot = keyof typeof SLOTS

const localTime = (instant: number, tz: string) =>
  new Intl.DateTimeFormat('es-MX', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    instant,
  )

/** Itinerario completo del viaje con la parte del pasajero resaltada. */
function TripItinerary({ result }: { result: DepartureResult }) {
  const { data: route, isLoading } = useRoute(result.routeId)
  if (isLoading || !route) return <LoadingBlock text="Cargando itinerario…" />
  // Instante de salida de la ruta desde su origen
  const start = Date.parse(result.board.at) - result.board.minutes * 60_000
  const points = [
    { id: 'o', t: route.originTerminal, minutes: 0 },
    ...route.stops.map((s) => ({ id: s.id, t: s.terminal, minutes: s.durationFromOriginMinutes })),
    { id: 'd', t: route.destinationTerminal, minutes: route.estimatedDurationMinutes },
  ]
  return (
    <ol className="space-y-1.5">
      {points.map((p, i) => {
        const inLeg = i >= result.boardIndex && i <= result.alightIndex
        const end = i === result.boardIndex || i === result.alightIndex
        return (
          <li
            key={p.id}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-1.5 text-sm',
              inLeg ? 'bg-primary-soft text-primary-soft-fg' : 'text-fg-muted',
            )}
          >
            <span className="w-12 font-data font-semibold">
              {localTime(start + p.minutes * 60_000, p.t.city.timezone)}
            </span>
            <span className={cn('font-data', end && 'font-bold')}>{p.t.code}</span>
            <span className="truncate">
              {p.t.city.name} · {p.t.name}
            </span>
            {i === result.boardIndex && <Badge tone="primary">Sube</Badge>}
            {i === result.alightIndex && <Badge tone="primary">Baja</Badge>}
          </li>
        )
      })}
      <li className="pt-1 text-right">
        <Link to={`/rutas/${result.routeId}`} className="text-sm text-link hover:underline">
          Ver la ruta {result.routeCode}
        </Link>
      </li>
    </ol>
  )
}

function ResultCard({ r }: { r: DepartureResult }) {
  const [open, setOpen] = useState(false)
  return (
    <Card>
      <button type="button" onClick={() => setOpen(!open)} className="w-full text-left" aria-expanded={open}>
        <CardBody className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="min-w-24">
            <div className="font-data text-2xl font-bold">{r.board.localTime}</div>
            <div className="text-xs text-fg-muted">
              {r.board.code} · {r.board.cityName}
            </div>
          </div>
          <div className="flex min-w-32 flex-1 flex-col items-center text-xs text-fg-muted">
            <span>{formatMinutes(r.durationMinutes)}</span>
            <span className="my-1 flex w-full items-center gap-1">
              <span className="h-px flex-1 bg-border" />
              <ArrowRight className="size-3.5" />
            </span>
            <span>{r.intermediateStops ? `${r.intermediateStops} parada(s) intermedia(s)` : 'Directo'}</span>
          </div>
          <div className="min-w-24">
            <div className="font-data text-2xl font-bold">
              {r.alight.localTime}
              {r.alight.dayOffset > 0 && <span className="text-sm text-fg-muted"> +{r.alight.dayOffset}</span>}
            </div>
            <div className="text-xs text-fg-muted">
              {r.alight.code} · {r.alight.cityName}
            </div>
          </div>
          <div className="ml-auto text-right">
            <div className="font-data text-2xl font-bold text-primary">{formatMoney(r.price)}</div>
            {r.season && r.season.priceModifierPercent !== 0 ? (
              <div className="text-xs text-fg-muted">
                <span className="line-through">{formatMoney(r.basePrice)}</span> · {r.season.name}{' '}
                {formatPercent(r.season.priceModifierPercent)}
              </div>
            ) : (
              <div className="text-xs text-fg-muted">Ruta {r.routeCode}</div>
            )}
          </div>
          <ChevronDown className={cn('size-5 text-fg-subtle transition-transform', open && 'rotate-180')} />
        </CardBody>
      </button>
      {open && (
        <div className="border-t border-border px-5 py-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
            <span>
              {r.routeName} · sale de origen el {dayLabel(r.tripDate)}
            </span>
            <span>Asientos disponibles: se confirmarán con los recorridos (Módulo 5)</span>
          </div>
          <TripItinerary result={r} />
        </div>
      )}
    </Card>
  )
}

function DeparturesSearchPage() {
  const [params, setParams] = useSearchParams()
  const origin = params.get('origen') ?? ''
  const destination = params.get('destino') ?? ''
  const date = params.get('fecha') ?? todayKey()
  const slot = (params.get('horario') ?? '') as Slot
  const directOnly = params.get('directos') === '1'
  const maxPrice = params.get('max') ?? ''
  const sort = params.get('orden') ?? 'departure'

  // La búsqueda vive en la URL para poder recargarla o compartirla
  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }

  const cities = useQuery({
    queryKey: ['routes', 'search', 'cities'],
    queryFn: async () => (await api.get<{ id: string; name: string }[]>('/routes/search/cities')).data,
  })
  const ready = !!origin && !!destination && origin !== destination
  const range = SLOTS[slot] ?? SLOTS['']
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['routes', 'search', { origin, destination, date, slot, directOnly, maxPrice, sort }],
    enabled: ready,
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (
        await api.get<DepartureSearch>('/routes/search', {
          params: {
            originCityId: origin,
            destinationCityId: destination,
            date,
            timeFrom: 'from' in range ? range.from : undefined,
            timeTo: 'to' in range ? range.to : undefined,
            directOnly: directOnly || undefined,
            maxPrice: maxPrice || undefined,
            sort,
          },
        })
      ).data,
  })

  const cityName = (id: string) => cities.data?.find((c) => c.id === id)?.name ?? '…'
  const today = todayKey()
  const tomorrow = addDaysKey(today, 1)
  const cityOptions = (
    <>
      <option value="">Selecciona…</option>
      {cities.data?.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Buscar salidas"
        description="Rutas directas y tramos entre dos ciudades, con hora local y el precio vigente para la fecha del viaje"
        refreshing={ready && isFetching && !isLoading}
      />

      <Card>
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-end">
            <Select label="Origen" value={origin} onChange={(e) => update({ origen: e.target.value })}>
              {cityOptions}
            </Select>
            <Button
              variant="secondary"
              size="icon"
              icon={ArrowLeftRight}
              aria-label="Intercambiar origen y destino"
              className="justify-self-center"
              onClick={() => update({ origen: destination, destino: origin })}
            />
            <Select label="Destino" value={destination} onChange={(e) => update({ destino: e.target.value })}>
              {cityOptions}
            </Select>
            <div className="flex items-end gap-2">
              <Input
                label="Fecha"
                type="date"
                min={today}
                value={date}
                onChange={(e) => e.target.value && update({ fecha: e.target.value })}
              />
              <Button variant={date === today ? 'primary' : 'secondary'} onClick={() => update({ fecha: today })}>
                Hoy
              </Button>
              <Button variant={date === tomorrow ? 'primary' : 'secondary'} onClick={() => update({ fecha: tomorrow })}>
                Mañana
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {ready && (
        <FilterBar>
          <div className="w-full sm:w-52">
            <Select value={slot} onChange={(e) => update({ horario: e.target.value })} aria-label="Horario">
              {(Object.keys(SLOTS) as Slot[]).map((k) => (
                <option key={k} value={k}>
                  {SLOTS[k].label}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-full sm:w-40">
            <Input
              type="number"
              min={1}
              placeholder="Precio máximo"
              aria-label="Precio máximo"
              value={maxPrice}
              onChange={(e) => update({ max: e.target.value })}
            />
          </div>
          <div className="w-full sm:w-48">
            <Select value={sort} onChange={(e) => update({ orden: e.target.value })} aria-label="Ordenar">
              <option value="departure">Por hora de salida</option>
              <option value="price">Por precio</option>
              <option value="duration">Por duración</option>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-indigo-600"
              checked={directOnly}
              onChange={(e) => update({ directos: e.target.checked ? '1' : '' })}
            />
            Solo directos
          </label>
        </FilterBar>
      )}

      {!ready ? (
        <EmptyState
          icon={Search}
          title={
            origin && origin === destination ? 'El origen y el destino son la misma ciudad' : 'Elige origen y destino'
          }
          description="Se buscan rutas directas y tramos de rutas que pasan por ambas ciudades"
        />
      ) : isLoading ? (
        <LoadingBlock text="Buscando salidas…" />
      ) : data && data.results.length ? (
        <div className="space-y-3">
          <p className="text-sm text-fg-muted">
            {data.results.length} salida(s) de {cityName(origin)} a {cityName(destination)} el {dayLabel(date)}
            {date === today && ' (sin las que ya salieron)'}
          </p>
          {data.results.map((r) => (
            <ResultCard key={`${r.scheduleId}-${r.tripDate}`} r={r} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={data?.connectingRoutes ? TicketCheck : SearchX}
          title={
            data?.connectingRoutes
              ? `No hay salidas el ${dayLabel(date)} con esos filtros`
              : `No hay rutas de ${cityName(origin)} a ${cityName(destination)}`
          }
          description={
            data?.connectingRoutes
              ? `${data.connectingRoutes} ruta(s) unen estas ciudades; prueba otra fecha u otro horario.`
              : 'Ninguna ruta activa pasa por ambas ciudades en ese sentido.'
          }
        />
      )}
    </div>
  )
}

export default DeparturesSearchPage
