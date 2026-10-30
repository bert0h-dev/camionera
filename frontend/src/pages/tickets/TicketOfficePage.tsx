import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowLeftRight, ArrowRight, Clock, Search, SearchX, Ticket, TimerReset, X } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { cn } from '../../lib/cn'
import { addDaysKey, dayLabel, formatMinutes, formatMoney, todayKey } from '../../lib/format'
import type { Order, SellableDeparture, SellableDepartureSearch, TripSeatMap } from '../../lib/types'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input, Select } from '../../components/ui/Field'
import { HeroStat } from '../../components/ui/HeroStat'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingBlock } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/toast-context'
import { ChangeCheckout } from './ChangeCheckout'
import { Checkout } from './Checkout'
import { SaleDone } from './SaleDone'
import { SeatPicker } from './SeatPicker'

const localTime = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('es-MX', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(iso),
  )

/** Segundos que faltan para `iso`, actualizados cada segundo. */
function useCountdown(iso: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!iso) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [iso])
  return iso ? Math.max(0, Math.floor((Date.parse(iso) - now) / 1000)) : 0
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function DepartureRow({ r, onPick }: { r: SellableDeparture; onPick: () => void }) {
  return (
    <Card>
      <CardBody className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-20">
          <div className="font-data text-2xl font-bold">{r.board.localTime}</div>
          <div className="text-xs text-fg-muted">
            {r.board.code} · {r.board.cityName}
          </div>
        </div>
        <div className="flex min-w-28 flex-1 flex-col items-center text-xs text-fg-muted">
          <span>{formatMinutes(r.durationMinutes)}</span>
          <span className="my-1 flex w-full items-center gap-1">
            <span className="h-px flex-1 bg-border" />
            <ArrowRight className="size-3.5" />
          </span>
          <span>{r.intermediateStops ? `${r.intermediateStops} parada(s)` : 'Directo'}</span>
        </div>
        <div className="min-w-20">
          <div className="font-data text-2xl font-bold">
            {r.alight.localTime}
            {r.alight.dayOffset > 0 && <span className="text-sm text-fg-muted"> +{r.alight.dayOffset}</span>}
          </div>
          <div className="text-xs text-fg-muted">
            {r.alight.code} · {r.alight.cityName}
          </div>
        </div>
        <div className="min-w-28 text-right">
          <div className="font-data text-xl font-bold text-primary">{formatMoney(r.price)}</div>
          <div className="text-xs text-fg-muted">
            Ruta {r.routeCode}
            {r.extra && (
              <Badge tone="info" className="ml-1">
                Extra
              </Badge>
            )}
          </div>
        </div>
        <div className="ml-auto flex min-w-44 flex-col items-end gap-1">
          {r.sellable ? (
            <>
              <Badge tone={r.freeSeats ? 'success' : 'danger'} dot>
                {r.freeSeats ? `${r.freeSeats} lugares libres` : 'Lleno en este tramo'}
              </Badge>
              <Button size="sm" disabled={!r.freeSeats} onClick={onPick}>
                Elegir asientos
              </Button>
            </>
          ) : (
            <span className="max-w-56 text-right text-xs text-fg-muted">{r.notSellableReason}</span>
          )}
        </div>
      </CardBody>
    </Card>
  )
}

/** Resumen del apartado con su tiempo restante mientras se capturan pasajeros y se cobra. */
function HoldPanel({ order, onDone }: { order: Order; onDone: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const left = useCountdown(order.status === 'pending' ? order.expiresAt : null)
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['tickets'] })
  }
  const update = useMutation({
    mutationFn: async (body: { removeSeats?: string[]; extend?: boolean }) =>
      (await api.patch<Order>(`/tickets/holds/${order.id}`, body)).data,
    onSuccess: (o) => {
      queryClient.setQueryData(['tickets', 'order', o.id], o)
      refresh()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })
  const release = useMutation({
    mutationFn: () => api.delete(`/tickets/holds/${order.id}`),
    onSuccess: () => {
      toast.success('Asientos liberados')
      refresh()
      onDone()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })
  const expired = order.status !== 'pending' || left === 0

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Ticket className="size-4 text-fg-subtle" />
            Apartado <span className="font-data">{order.orderNumber}</span>
          </span>
        }
        description={`${order.tickets.length} asiento(s) apartados mientras cobras`}
        actions={
          <span
            className={cn(
              'flex items-center gap-1.5 font-data text-lg font-bold',
              left < 60 ? 'text-red-600 dark:text-red-400' : 'text-fg',
            )}
          >
            <Clock className="size-4" />
            {expired ? 'Venció' : mmss(left)}
          </span>
        }
      />
      <CardBody className="space-y-4">
        {expired ? (
          <Alert tone="warning" title="El apartado venció">
            Los asientos se liberaron. Vuelve a elegirlos en el mapa.
          </Alert>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {order.tickets.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="flex size-9 items-center justify-center rounded-md bg-primary-soft font-data font-bold text-primary-soft-fg">
                    {t.seatNumber}
                  </span>
                  <span className="flex-1">
                    <span className="font-data">
                      {t.boardTerminal.code} → {t.alightTerminal.code}
                    </span>
                    <span className="block text-xs text-fg-muted">
                      {t.passengerName ? `${t.passengerName} · ${t.passengerType.name}` : 'Pasajero por capturar'}
                    </span>
                  </span>
                  <span className="font-data font-semibold">{formatMoney(t.total)}</span>
                  {order.tickets.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      icon={X}
                      aria-label={`Quitar el asiento ${t.seatNumber}`}
                      onClick={() => update.mutate({ removeSeats: [t.seatNumber] })}
                    />
                  )}
                </li>
              ))}
            </ul>
            <dl className="space-y-1 border-t border-border pt-3 text-sm">
              <div className="flex justify-between text-fg-muted">
                <dt>IVA incluido</dt>
                <dd className="font-data">{formatMoney(order.vat)}</dd>
              </div>
              <div className="flex justify-between text-base font-bold">
                <dt>Total</dt>
                <dd className="font-data text-primary">{formatMoney(order.total)}</dd>
              </div>
            </dl>
          </>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {!expired && order.canExtend && (
            <Button
              variant="secondary"
              icon={TimerReset}
              loading={update.isPending}
              onClick={() => update.mutate({ extend: true })}
            >
              Más tiempo
            </Button>
          )}
          {expired ? (
            <Button onClick={onDone}>Elegir de nuevo</Button>
          ) : (
            <Button variant="danger" loading={release.isPending} onClick={() => release.mutate()}>
              Soltar asientos
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  )
}

function TicketOfficePage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const origin = params.get('origen') ?? ''
  const destination = params.get('destino') ?? ''
  const date = params.get('fecha') ?? todayKey()
  const tripId = params.get('viaje') ?? ''
  const board = params.get('sube') ?? ''
  const alight = params.get('baja') ?? ''
  const orderId = params.get('compra') ?? ''
  // Modo cambio (6.4): se elige la salida y un solo asiento para el boleto indicado
  const changeOf = params.get('cambio') ?? ''
  const [selected, setSelected] = useState<string[]>([])
  // Venta recién cobrada (con el cambio a entregar); se muestra hasta empezar otra
  const [paid, setPaid] = useState<Order | null>(null)

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
  const departures = useQuery({
    queryKey: ['tickets', 'departures', { origin, destination, date }],
    enabled: ready && !tripId,
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (
        await api.get<SellableDepartureSearch>('/tickets/departures', {
          params: { originCityId: origin, destinationCityId: destination, date },
        })
      ).data,
  })
  const map = useQuery({
    queryKey: ['tickets', 'seats', tripId, board, alight],
    enabled: !!tripId && board !== '' && alight !== '',
    // Otros vendedores también apartan: el mapa se refresca solo
    refetchInterval: 15_000,
    queryFn: async () =>
      (await api.get<TripSeatMap>(`/tickets/trips/${tripId}/seats`, { params: { board, alight } })).data,
  })
  const order = useQuery({
    queryKey: ['tickets', 'order', orderId],
    enabled: !!orderId,
    queryFn: async () => (await api.get<Order>(`/tickets/orders/${orderId}`)).data,
  })
  const holdLeft = useCountdown(order.data?.status === 'pending' ? order.data.expiresAt : null)

  const hold = useMutation({
    mutationFn: async () =>
      changeOf
        ? (
            await api.post<Order>('/tickets/changes', {
              ticketId: changeOf,
              tripId,
              boardIndex: Number(board),
              alightIndex: Number(alight),
              seat: selected[0],
            })
          ).data
        : (
            await api.post<Order>('/tickets/holds', {
              tripId,
              boardIndex: Number(board),
              alightIndex: Number(alight),
              seats: selected,
            })
          ).data,
    onSuccess: (o) => {
      queryClient.setQueryData(['tickets', 'order', o.id], o)
      queryClient.invalidateQueries({ queryKey: ['tickets', 'seats'] })
      setSelected([])
      update({ compra: o.id })
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err))
      queryClient.invalidateQueries({ queryKey: ['tickets', 'seats'] })
    },
  })

  const pick = (r: SellableDeparture) => {
    setSelected([])
    update({ viaje: r.trip?.id ?? '', sube: String(r.boardIndex), baja: String(r.alightIndex), compra: '' })
  }
  const back = () => {
    setSelected([])
    update({ viaje: '', sube: '', baja: '', compra: '' })
  }
  const newSale = () => {
    setPaid(null)
    setSelected([])
    update({ viaje: '', sube: '', baja: '', compra: '', cambio: '' })
  }
  const toggle = (n: string) =>
    setSelected((s) => (s.includes(n) ? s.filter((x) => x !== n) : changeOf ? [n] : [...s, n]))

  const m = map.data
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
  const stepLabel = paid
    ? changeOf
      ? 'Cambio listo'
      : 'Venta lista'
    : !tripId
      ? '1 · Salida'
      : orderId
        ? changeOf
          ? '3 · Diferencia'
          : '3 · Pasajeros y cobro'
        : '2 · Asientos'

  return (
    <div className="space-y-6">
      <PageHeader
        title={changeOf ? 'Cambio de boleto' : 'Taquilla'}
        description={
          changeOf
            ? 'Elige la nueva salida y el asiento; se cobra o se devuelve la diferencia'
            : 'Venta en mostrador: busca la salida, elige asientos en el mapa y apártalos mientras cobras'
        }
        refreshing={(map.isFetching && !map.isLoading) || (departures.isFetching && !departures.isLoading)}
        actions={
          <span className="font-data text-base font-bold tracking-wide text-amber-400 uppercase">{stepLabel}</span>
        }
        stats={
          m && (
            <>
              <HeroStat
                label="Salida"
                value={localTime(m.segment.board.at, m.segment.board.timezone)}
                hint={`${m.segment.board.code} → ${m.segment.alight.code} · ${m.trip.tripNumber}`}
                tone="primary"
              />
              <HeroStat
                label="Precio del tramo"
                value={formatMoney(m.price.price)}
                hint={m.price.season?.name ?? 'sin temporada'}
              />
              <HeroStat
                label="Libres en el tramo"
                value={m.counts.free}
                hint={`de ${m.seats.length} asientos`}
                tone={m.counts.free ? 'success' : 'danger'}
              />
              <HeroStat label="Apartados" value={m.counts.held} hint="por ti y otros vendedores" />
            </>
          )
        }
      />

      {!tripId && !paid && (
        <>
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
                  <Button
                    variant={date === tomorrow ? 'primary' : 'secondary'}
                    onClick={() => update({ fecha: tomorrow })}
                  >
                    Mañana
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>

          {!ready ? (
            <EmptyState
              icon={Search}
              title="Elige origen y destino"
              description="Se muestran las salidas con lugares libres en el tramo"
            />
          ) : departures.isLoading ? (
            <LoadingBlock text="Buscando salidas…" />
          ) : departures.data?.results.length ? (
            <div className="space-y-3">
              <p className="text-sm text-fg-muted">
                {departures.data.results.length} salida(s) de {cityName(origin)} a {cityName(destination)} el{' '}
                {dayLabel(date)}
              </p>
              {departures.data.results.map((r) => (
                <DepartureRow key={`${r.scheduleId}-${r.tripDate}`} r={r} onPick={() => pick(r)} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={SearchX}
              title={`No hay salidas de ${cityName(origin)} a ${cityName(destination)} el ${dayLabel(date)}`}
              description="Prueba otra fecha"
            />
          )}
        </>
      )}

      {paid && <SaleDone order={paid} onNew={newSale} title={changeOf ? 'Cambio listo' : undefined} />}

      {tripId && !paid && (
        <div className="space-y-4">
          <Button variant="ghost" icon={ArrowLeft} onClick={back}>
            Cambiar salida
          </Button>
          {map.isLoading ? (
            <LoadingBlock text="Cargando asientos…" />
          ) : map.isError || !m ? (
            <Alert tone="danger">{apiErrorMessage(map.error)}</Alert>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
              {changeOf && orderId && order.data?.status === 'pending' && holdLeft > 0 ? (
                <ChangeCheckout
                  orderId={orderId}
                  onDone={(o) => {
                    setPaid(o)
                    update({ viaje: '', sube: '', baja: '', compra: '' })
                  }}
                />
              ) : orderId && order.data?.status === 'pending' && holdLeft > 0 ? (
                <Checkout
                  key={order.data.id}
                  order={order.data}
                  passengerTypes={m.passengerTypes}
                  onPaid={(o) => {
                    setPaid(o)
                    update({ viaje: '', sube: '', baja: '', compra: '' })
                  }}
                />
              ) : (
                <Card>
                  <CardHeader
                    title={`${m.trip.route.code} · ${m.trip.route.name}`}
                    description={
                      m.bus
                        ? `Unidad ${m.bus.economicNumber} · ${m.bus.model.brand} ${m.bus.model.model}`
                        : 'Sin unidad asignada'
                    }
                  />
                  <CardBody>
                    {m.bus ? (
                      <SeatPicker
                        layout={m.bus.model.layout}
                        seats={m.seats}
                        selected={selected}
                        onToggle={toggle}
                        disabled={!m.sellable || !!orderId}
                      />
                    ) : (
                      <Alert tone="warning">{m.notSellableReason}</Alert>
                    )}
                  </CardBody>
                </Card>
              )}

              <div className="space-y-4">
                {!m.sellable && m.bus && <Alert tone="warning">{m.notSellableReason}</Alert>}
                {orderId && order.data ? (
                  <HoldPanel order={order.data} onDone={() => update({ compra: '' })} />
                ) : (
                  <Card>
                    <CardHeader
                      title="Tramo"
                      description={`${m.segment.board.cityName} → ${m.segment.alight.cityName}`}
                    />
                    <CardBody className="space-y-4">
                      <ol className="space-y-1">
                        {m.itinerary.map((p) => {
                          const inLeg = p.index >= m.segment.board.index && p.index <= m.segment.alight.index
                          return (
                            <li
                              key={p.index}
                              className={cn(
                                'flex items-center gap-3 rounded-md px-2 py-1 text-sm',
                                inLeg ? 'bg-primary-soft text-primary-soft-fg' : 'text-fg-muted',
                              )}
                            >
                              <span className="w-11 font-data font-semibold">{localTime(p.at, p.timezone)}</span>
                              <span className="font-data">{p.code}</span>
                              <span className="truncate">{p.cityName}</span>
                            </li>
                          )
                        })}
                      </ol>
                      <div className="flex items-center justify-between border-t border-border pt-3">
                        <span className="text-sm text-fg-muted">
                          {selected.length ? `Asientos ${selected.join(', ')}` : 'Elige asientos en el mapa'}
                        </span>
                        <span className="font-data text-lg font-bold text-primary">
                          {formatMoney(m.price.price * selected.length)}
                        </span>
                      </div>
                      <p className="text-xs text-fg-muted">
                        Precio de adulto. Los descuentos por tipo de pasajero se aplican al capturar a cada uno.
                      </p>
                      <Button
                        className="w-full"
                        disabled={!selected.length || !m.sellable}
                        loading={hold.isPending}
                        onClick={() => hold.mutate()}
                      >
                        {changeOf ? 'Apartar asiento para el cambio' : `Apartar ${selected.length || ''} asiento(s)`}
                      </Button>
                    </CardBody>
                  </Card>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default TicketOfficePage
