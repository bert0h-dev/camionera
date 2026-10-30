import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, FileDown, IdCard, Search, Undo2, XCircle } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { cn } from '../../lib/cn'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Input } from '../../components/ui/Field'
import { HeroStat } from '../../components/ui/HeroStat'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingBlock } from '../../components/ui/Spinner'
import { Alert } from '../../components/ui/Alert'
import { useToast } from '../../components/ui/toast-context'
import { QrScanner } from './QrScanner'

interface Passenger {
  id: string
  ticketNumber: string
  seatNumber: string
  status: 'confirmed' | 'checked_in' | 'no_show'
  passengerName: string
  passengerDocument: string | null
  checkedInAt: string | null
  passengerType: { name: string; requiresId: boolean }
  checkedInBy: { fullName: string } | null
  alightTerminal: { code: string; name: string }
}

interface Manifest {
  trip: {
    id: string
    tripNumber: string
    status: string
    departureAt: string
    route: { code: string; name: string }
    bus: string | null
    driver: string | null
    collector: string | null
  }
  totals: { expected: number; boarded: number; noShow: number }
  checkinMinutes: number
  stops: {
    index: number
    code: string
    name: string
    cityName: string
    timezone: string
    at: string
    open: boolean
    expected: number
    boarded: number
    passengers: Passenger[]
  }[]
}

interface CheckInResult {
  seatNumber: string
  passengerName: string
  passengerType: string
  passengerDocument: string | null
  verifyId: boolean
  board: { code: string }
  alight: { code: string }
}

type Flash = { ok: true; r: CheckInResult } | { ok: false; message: string }

const hour = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('es-MX', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(iso),
  )

const buzz = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Sin vibración no pasa nada
  }
}

/** Abre el PDF del manifiesto en otra pestaña (lleva el token, por eso no es un enlace directo). */
async function openManifestPdf(tripId: string) {
  const tab = window.open('', '_blank')
  const { data } = await api.get<Blob>(`/tickets/trips/${tripId}/manifest/pdf`, { responseType: 'blob' })
  const url = URL.createObjectURL(data)
  if (tab) tab.location.href = url
  else window.location.href = url
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** Abordaje en el celular: escanear QR o escribir folio, ver el resultado en grande y la lista por parada. */
function BoardingPage() {
  const { id = '' } = useParams()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [search, setSearch] = useState('')
  const [flash, setFlash] = useState<Flash | null>(null)
  const [scanning, setScanning] = useState(true)

  const {
    data: m,
    isLoading,
    error,
    isFetching,
  } = useQuery({
    queryKey: ['tickets', 'manifest', id],
    refetchInterval: 15_000,
    queryFn: async () => (await api.get<Manifest>(`/tickets/trips/${id}/manifest`)).data,
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['tickets', 'manifest', id] })

  const checkIn = useMutation({
    mutationFn: async (c: string) => (await api.post<CheckInResult>(`/tickets/trips/${id}/check-in`, { code: c })).data,
    onSuccess: (r) => {
      setFlash({ ok: true, r })
      buzz(r.verifyId ? [80, 60, 80] : 80)
      setCode('')
      refresh()
    },
    onError: (err) => {
      setFlash({ ok: false, message: apiErrorMessage(err) })
      buzz([200, 80, 200])
    },
  })
  const undo = useMutation({
    mutationFn: (ticketId: string) => api.delete(`/tickets/check-in/${ticketId}`),
    onSuccess: () => {
      toast.success('Se deshizo el abordaje')
      refresh()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })
  const pdf = useMutation({
    mutationFn: () => openManifestPdf(id),
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const q = search.trim().toLowerCase()
  const matches = (p: Passenger) =>
    !q || p.passengerName.toLowerCase().includes(q) || p.seatNumber === q || p.ticketNumber.toLowerCase().includes(q)

  if (isLoading) return <LoadingBlock text="Cargando pasajeros…" />
  if (!m) return <Alert tone="danger">{apiErrorMessage(error)}</Alert>
  const closed = m.trip.status === 'cancelled' || m.trip.status === 'completed'

  return (
    <div className="space-y-5">
      <PageHeader
        title="Abordaje"
        description={`${m.trip.route.code} · ${m.trip.route.name} · ${m.trip.tripNumber}${m.trip.bus ? ` · unidad ${m.trip.bus}` : ''}`}
        refreshing={isFetching}
        actions={
          <Button variant="glass" icon={FileDown} loading={pdf.isPending} onClick={() => pdf.mutate()}>
            Manifiesto
          </Button>
        }
        stats={
          <>
            <HeroStat
              label="Abordaron"
              value={`${m.totals.boarded}/${m.totals.expected}`}
              tone="primary"
              hint="de los boletos vendidos"
            />
            <HeroStat
              label="Por abordar"
              value={m.totals.expected - m.totals.boarded - m.totals.noShow}
              hint={`se abre ${m.checkinMinutes} min antes de cada parada`}
            />
            <HeroStat
              label="No se presentaron"
              value={m.totals.noShow}
              tone={m.totals.noShow ? 'warning' : 'neutral'}
              hint="se marcan al pasar su parada"
            />
          </>
        }
        statsColumns={4}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="space-y-3">
          {!closed && (
            <>
              {scanning ? (
                <QrScanner paused={checkIn.isPending} onCode={(c) => checkIn.mutate(c)} />
              ) : (
                <Button className="w-full" variant="secondary" onClick={() => setScanning(true)}>
                  Usar la cámara
                </Button>
              )}
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (code.trim()) checkIn.mutate(code.trim())
                }}
              >
                <Input
                  placeholder="Folio del boleto (B0000…)"
                  aria-label="Folio del boleto"
                  className="font-data uppercase"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
                <Button type="submit" loading={checkIn.isPending}>
                  Abordar
                </Button>
              </form>
              {scanning && (
                <button type="button" className="text-xs text-fg-muted underline" onClick={() => setScanning(false)}>
                  Apagar la cámara
                </button>
              )}
            </>
          )}
          {closed && <Alert tone="info">El recorrido ya no está en abordaje.</Alert>}

          {flash && (
            <div
              role="status"
              aria-live="assertive"
              className={cn(
                'rounded-2xl p-5 text-white',
                flash.ok ? (flash.r.verifyId ? 'bg-amber-600' : 'bg-emerald-600') : 'bg-red-600',
              )}
            >
              {flash.ok ? (
                <>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {flash.r.verifyId ? <IdCard className="size-5" /> : <CheckCircle2 className="size-5" />}
                    {flash.r.verifyId ? 'Abordó · verifica credencial' : 'Abordó'}
                  </div>
                  <div className="mt-2 flex items-end gap-4">
                    <span className="font-data text-5xl font-bold">{flash.r.seatNumber}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-lg font-semibold">{flash.r.passengerName}</span>
                      <span className="block text-sm opacity-90">
                        {flash.r.passengerType}
                        {flash.r.passengerDocument && ` · ${flash.r.passengerDocument}`} · baja en {flash.r.alight.code}
                      </span>
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex items-start gap-2">
                  <XCircle className="mt-0.5 size-6 shrink-0" />
                  <span className="text-lg font-semibold">{flash.message}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Input
            icon={Search}
            placeholder="Buscar por nombre, asiento o folio"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {m.stops.length === 0 && <p className="text-sm text-fg-muted">El recorrido no tiene pasajeros.</p>}
          {m.stops.map((s) => {
            const list = s.passengers.filter(matches)
            if (q && !list.length) return null
            return (
              <Card key={s.index}>
                <CardHeader
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      Suben en {s.code} · {s.cityName}
                      <span className="font-data text-sm text-fg-muted">{hour(s.at, s.timezone)}</span>
                      {s.open && <Badge tone="success">abordando</Badge>}
                    </span>
                  }
                  actions={
                    <span className="font-data text-sm font-semibold">
                      {s.boarded}/{s.expected}
                    </span>
                  }
                />
                <CardBody className="p-0">
                  <ul className="divide-y divide-border">
                    {list.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span
                          className={cn(
                            'flex size-10 shrink-0 items-center justify-center rounded-md font-data text-lg font-bold',
                            p.status === 'checked_in'
                              ? 'bg-emerald-600 text-white'
                              : p.status === 'no_show'
                                ? 'bg-surface-sunken text-fg-subtle line-through'
                                : 'bg-primary-soft text-primary-soft-fg',
                          )}
                        >
                          {p.seatNumber}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{p.passengerName}</span>
                          <span className="block truncate text-xs text-fg-muted">
                            {p.passengerType.name}
                            {p.passengerType.requiresId && ' · credencial'} · baja en {p.alightTerminal.code}
                            {p.status === 'checked_in' &&
                              p.checkedInAt &&
                              ` · abordó ${hour(p.checkedInAt, s.timezone)}`}
                          </span>
                        </span>
                        {p.status === 'confirmed' && !closed && (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={checkIn.isPending && checkIn.variables === p.ticketNumber}
                            onClick={() => checkIn.mutate(p.ticketNumber)}
                          >
                            Abordar
                          </Button>
                        )}
                        {p.status === 'checked_in' && s.open && (
                          <Button
                            size="icon"
                            variant="ghost"
                            icon={Undo2}
                            aria-label={`Deshacer el abordaje de ${p.passengerName}`}
                            onClick={() => undo.mutate(p.id)}
                          />
                        )}
                        {p.status === 'no_show' && <Badge>No se presentó</Badge>}
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default BoardingPage
