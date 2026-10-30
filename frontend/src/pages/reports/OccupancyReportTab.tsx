import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Gauge } from 'lucide-react'
import { apiErrorMessage } from '../../lib/api'
import { cn } from '../../lib/cn'
import { formatMoney } from '../../lib/format'
import type { OccupancyReport } from '../../lib/types'
import { Alert } from '../../components/ui/Alert'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { HeroStat } from '../../components/ui/HeroStat'
import { LoadingBlock } from '../../components/ui/Spinner'
import { Pagination, Table, type Column } from '../../components/ui/Table'
import { OccupancyLine, RankingBars } from './charts'
import type { useOccupancyReport } from './useReports'

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
// Columnas en orden lunes → domingo (getUTCDay: 0 = domingo)
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const SLOTS = [0, 3, 6, 9, 12, 15, 18, 21]
const SHORT = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const PAGE = 20

/** Tono índigo según la ocupación (vacío casi transparente, lleno intenso). */
const heatStyle = (p: number) => ({ backgroundColor: `rgba(79, 70, 229, ${0.08 + (Math.min(100, p) / 100) * 0.85})` })

/** Barra de ocupación para tablas. */
function OccBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-sunken">
        <div
          className={cn(
            'h-full rounded-full',
            value < 25 ? 'bg-red-500' : value >= 90 ? 'bg-emerald-500' : 'bg-indigo-500',
          )}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
      <span className="w-16 text-right font-data text-sm whitespace-nowrap">{value} %</span>
    </div>
  )
}

export function OccupancyStats({ data, loading }: { data?: OccupancyReport; loading: boolean }) {
  const k = data?.summary
  const delta = k?.change.byKm
  return (
    <>
      <HeroStat
        label="Ocupación"
        value={`${k?.byKm ?? 0} %`}
        tone="primary"
        loading={loading}
        hint={
          k
            ? delta == null
              ? 'por asiento-km'
              : `${delta > 0 ? '+' : ''}${delta} pts contra el periodo anterior`
            : undefined
        }
      />
      <HeroStat
        label="Recorridos"
        value={(k?.trips ?? 0).toLocaleString('es-MX')}
        loading={loading}
        hint={k ? `${k.empty} casi vacíos · ${k.full} casi llenos` : undefined}
      />
      <HeroStat
        label="Boletos por asiento"
        value={`${k?.bySeats ?? 0} %`}
        loading={loading}
        hint="con tramos puede pasar de 100 %"
      />
      <HeroStat
        label="No se presentaron"
        value={`${k?.noShowRate ?? 0} %`}
        tone={k && k.noShowRate > 10 ? 'warning' : 'neutral'}
        loading={loading}
        hint={k ? `ingreso por recorrido ${formatMoney(k.revenuePerTrip)}` : undefined}
      />
    </>
  )
}

export function OccupancyReportTab({ query }: { query: ReturnType<typeof useOccupancyReport> }) {
  const { data, isLoading, error } = query
  const [page, setPage] = useState(1)
  if (isLoading) return <LoadingBlock text="Calculando ocupación…" />
  if (!data) return <Alert tone="danger">{apiErrorMessage(error)}</Alert>
  if (!data.summary.trips)
    return (
      <EmptyState icon={Gauge} title="Sin recorridos operados en el periodo" description="Prueba con otro periodo" />
    )

  const cell = (weekday: number, slot: number) => data.heatmap.find((h) => h.weekday === weekday && h.slot === slot)
  const scheduleCols: Column<OccupancyReport['bySchedule'][number]>[] = [
    {
      header: 'Horario',
      cell: (s) => (
        <Link to={`/rutas/${s.routeId}`} className="hover:underline">
          <span className="font-data font-semibold">{s.departureTime}</span>{' '}
          <span className="text-fg-muted">{s.routeCode}</span>
        </Link>
      ),
    },
    {
      header: 'Días',
      cell: (s) => <span className="font-data text-xs">{s.daysOfWeek.map((d) => SHORT[d]).join(' ') || '—'}</span>,
    },
    { header: 'Recorridos', cell: (s) => <span className="font-data">{s.trips}</span> },
    { header: 'Boletos prom.', cell: (s) => <span className="font-data">{s.avgSold}</span> },
    { header: 'Casi vacíos', cell: (s) => <span className="font-data">{s.empty}</span> },
    { header: 'Ocupación', cell: (s) => <OccBar value={s.byKm} /> },
  ]
  const detailCols: Column<OccupancyReport['detail'][number]>[] = [
    {
      header: 'Salida',
      cell: (t) => (
        <span className="font-data text-sm">
          {t.date.slice(8)}/{t.date.slice(5, 7)} {t.time}
        </span>
      ),
    },
    {
      header: 'Recorrido',
      cell: (t) => (
        <Link to={`/recorridos/${t.tripId}`} className="font-data text-xs text-link hover:underline">
          {t.tripNumber}
        </Link>
      ),
    },
    { header: 'Unidad', cell: (t) => <span className="font-data">{t.bus ?? '—'}</span> },
    {
      header: 'Boletos',
      cell: (t) => (
        <span className="font-data">
          {t.sold}/{t.seats}
        </span>
      ),
    },
    { header: 'Abordaron', cell: (t) => <span className="font-data">{t.boarded}</span> },
    { header: 'Ocupación', cell: (t) => <OccBar value={t.byKm} /> },
    { header: 'Ingreso', cell: (t) => <span className="font-data">{formatMoney(t.revenue)}</span> },
  ]
  const pages = Math.max(1, Math.ceil(data.detail.length / PAGE))

  return (
    <div className="space-y-6">
      <Alert tone="info">
        La ocupación se mide por <strong>asiento-km</strong>: km ocupados entre km ofrecidos. Así un boleto de un tramo
        corto pesa menos que uno de origen a destino, y nunca pasa de 100 % aunque un asiento se venda varias veces por
        tramos.
      </Alert>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Ocupación por día" description="Por día de salida" />
          <CardBody>
            <OccupancyLine data={data.byDay} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Por ruta" description="Ocupación promedio ponderada" />
          <CardBody>
            <RankingBars percent data={data.byRoute.map((r) => ({ name: r.code, value: r.byKm }))} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Día de la semana y hora de salida"
          description="Ocupación por franjas de 3 horas (hora local del origen). Lo más intenso va más lleno."
        />
        <CardBody className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-separate border-spacing-1 text-center text-xs">
            <thead>
              <tr>
                <th className="w-20" />
                {WEEKDAY_ORDER.map((d, i) => (
                  <th key={d} className="font-medium text-fg-muted">
                    {WEEKDAYS[i]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SLOTS.map((from, slot) => (
                <tr key={from}>
                  <td className="text-right font-data text-fg-muted">
                    {String(from).padStart(2, '0')}–{String(from + 3).padStart(2, '0')}
                  </td>
                  {WEEKDAY_ORDER.map((d) => {
                    const c = cell(d, slot)
                    return (
                      <td
                        key={d}
                        title={c ? `${c.trips} recorrido(s) · ${c.byKm} %` : 'Sin salidas'}
                        className={cn(
                          'h-9 rounded-md font-data',
                          c ? (c.byKm >= 55 ? 'text-white' : 'text-fg') : 'text-fg-subtle',
                        )}
                        style={c ? heatStyle(c.byKm) : undefined}
                      >
                        {c ? `${Math.round(c.byKm)}` : '·'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold tracking-wide text-fg-subtle uppercase">
          Horarios, del más vacío al más lleno
        </h2>
        <Table columns={scheduleCols} rows={data.bySchedule} rowKey={(s) => s.scheduleId ?? `extra-${s.routeId}`} />
      </div>

      {data.byLeg.length > 0 && (
        <Card>
          <CardHeader
            title="Ocupación por trecho"
            description="En rutas con paradas: cuántos asientos van ocupados entre cada par de puntos"
          />
          <CardBody className="space-y-4">
            {data.byLeg.map((r) => (
              <div key={r.routeId}>
                <div className="mb-2 text-sm font-medium">
                  {r.code} · {r.name}
                </div>
                <div className="flex gap-1">
                  {r.legs.map((l) => (
                    <div
                      key={`${l.from}-${l.to}`}
                      className="min-w-0 rounded-md p-2 text-center"
                      style={{ flexGrow: Math.max(1, l.km), ...heatStyle(l.occupancy) }}
                      title={`${l.km} km · ${l.avgSeats} asientos ocupados en promedio`}
                    >
                      <div className={cn('font-data text-xs', l.occupancy >= 55 ? 'text-white' : 'text-fg')}>
                        {l.from} → {l.to}
                      </div>
                      <div className={cn('font-data text-sm font-bold', l.occupancy >= 55 ? 'text-white' : 'text-fg')}>
                        {l.occupancy} %
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-semibold tracking-wide text-fg-subtle uppercase">Recorridos</h2>
        <Table columns={detailCols} rows={data.detail.slice((page - 1) * PAGE, page * PAGE)} rowKey={(t) => t.tripId} />
        {pages > 1 && <Pagination page={page} totalPages={pages} total={data.detail.length} onChange={setPage} />}
      </div>
    </div>
  )
}
