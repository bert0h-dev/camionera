import { Link } from 'react-router-dom'
import { Ban } from 'lucide-react'
import { apiErrorMessage } from '../../lib/api'
import { businessFormat, formatMoney } from '../../lib/format'
import type { CancellationReport } from '../../lib/types'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { HeroStat } from '../../components/ui/HeroStat'
import { LoadingBlock } from '../../components/ui/Spinner'
import { Table, type Column } from '../../components/ui/Table'
import { METHOD_LABELS } from '../tickets/useTickets'
import { DailyCountChart, ShareDonut } from './charts'
import type { useCancellationReport } from './useReports'

const WHEN = businessFormat({ dateStyle: 'medium', timeStyle: 'short' })
const KINDS = { passenger: 'Cancelación del pasajero', trip: 'Recorrido cancelado', change: 'Diferencia de un cambio' }

const points = (v: number) => `${v > 0 ? '+' : ''}${v} pts contra el periodo anterior`

export function CancellationStats({ data, loading }: { data?: CancellationReport; loading: boolean }) {
  const k = data?.summary
  return (
    <>
      <HeroStat
        label="Cancelación"
        value={`${k?.cancelRate ?? 0} %`}
        tone="primary"
        loading={loading}
        hint={k ? `${k.cancelled} boletos · ${points(k.change.cancelRate)}` : undefined}
      />
      <HeroStat
        label="No se presentaron"
        value={`${k?.noShowRate ?? 0} %`}
        tone={k && k.noShowRate > 10 ? 'warning' : 'neutral'}
        loading={loading}
        hint={k ? `${k.noShow} boletos · ${points(k.change.noShowRate)}` : undefined}
      />
      <HeroStat
        label="Reembolsado"
        value={formatMoney(k?.refunds ?? 0)}
        loading={loading}
        hint="en el periodo, todos los orígenes"
      />
      <HeroStat
        label="Saldo por devolver"
        value={formatMoney(k?.pendingRefunds ?? 0)}
        tone={k?.pendingRefunds ? 'warning' : 'neutral'}
        loading={loading}
        hint={k ? `${k.companyTrips} recorrido(s) cancelado(s) por la empresa` : undefined}
      />
    </>
  )
}

export function CancellationReportTab({ query }: { query: ReturnType<typeof useCancellationReport> }) {
  const { data, isLoading, error } = query
  if (isLoading) return <LoadingBlock text="Calculando cancelaciones…" />
  if (!data) return <Alert tone="danger">{apiErrorMessage(error)}</Alert>
  const k = data.summary
  if (!k.sold && !k.refunds)
    return <EmptyState icon={Ban} title="Sin boletos en el periodo" description="Prueba con otro periodo" />

  const routeCols: Column<CancellationReport['byRoute'][number]>[] = [
    {
      header: 'Ruta',
      cell: (r) => (
        <div>
          <div className="font-medium">{r.name}</div>
          <div className="font-data text-xs text-fg-muted">{r.code}</div>
        </div>
      ),
    },
    { header: 'Vendidos', cell: (r) => <span className="font-data">{r.sold}</span> },
    { header: '% cancelación', cell: (r) => <span className="font-data">{r.cancelRate} %</span> },
    { header: '% no presentados', cell: (r) => <span className="font-data">{r.noShowRate} %</span> },
    {
      header: 'Ingreso de no presentados',
      cell: (r) => <span className="font-data">{formatMoney(r.noShowRevenue)}</span>,
    },
  ]
  const scheduleCols: Column<CancellationReport['bySchedule'][number]>[] = [
    {
      header: 'Horario',
      cell: (s) => (
        <span>
          <span className="font-data font-semibold">{s.departureTime}</span>{' '}
          <span className="text-fg-muted">{s.routeCode}</span>
        </span>
      ),
    },
    { header: 'Vendidos', cell: (s) => <span className="font-data">{s.sold}</span> },
    { header: '% no presentados', cell: (s) => <span className="font-data font-semibold">{s.noShowRate} %</span> },
    { header: '% cancelación', cell: (s) => <span className="font-data">{s.cancelRate} %</span> },
  ]
  const tripCols: Column<CancellationReport['companyTrips'][number]>[] = [
    {
      header: 'Recorrido',
      cell: (t) => (
        <Link to={`/recorridos/${t.tripId}`} className="font-data text-xs text-link hover:underline">
          {t.tripNumber}
        </Link>
      ),
    },
    { header: 'Salida', cell: (t) => <span className="text-sm">{WHEN.format(new Date(t.departureAt))}</span> },
    { header: 'Motivo', cell: (t) => <span className="text-sm">{t.reason ?? '—'}</span> },
    { header: 'Boletos', cell: (t) => <span className="font-data">{t.tickets}</span> },
    { header: 'Saldo', cell: (t) => <span className="font-data">{formatMoney(t.amount)}</span> },
    { header: 'Reembolsado', cell: (t) => <span className="font-data">{formatMoney(t.refunded)}</span> },
    { header: 'Reubicados', cell: (t) => <span className="font-data">{t.relocated}</span> },
    {
      header: 'Pendiente',
      cell: (t) =>
        t.pending > 0 ? <Badge tone="warning">{formatMoney(t.pending)}</Badge> : <Badge tone="success">Atendido</Badge>,
    },
  ]
  const totalNotice = data.notice.reduce((a, n) => a + n.tickets, 0)

  return (
    <div className="space-y-6">
      <Alert tone="info">
        Las tasas son por <strong>fecha de salida</strong>: boletos cancelados o no presentados entre los vendidos para
        los recorridos del periodo. La anticipación, los motivos y el dinero cuentan por la fecha en que pasaron. Los
        recorridos cancelados por la empresa van aparte.
      </Alert>

      <Card>
        <CardHeader title="Por día de salida" description="Cancelados por el pasajero y no presentados" />
        <CardBody>
          <DailyCountChart
            data={data.byDay}
            series={[
              { key: 'cancelled', name: 'Cancelados' },
              { key: 'noShow', name: 'No se presentaron' },
            ]}
          />
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Con cuánta anticipación cancelan"
            description={`${k.inWindow} dentro del plazo (${data.cancellationHours} h antes) · ${k.lateCancels} fuera de plazo (autorizadas por admin)`}
          />
          <CardBody className="space-y-2">
            {data.notice.map((n) => (
              <div key={n.key} className="flex items-center gap-3 text-sm">
                <span className="w-28 text-fg-muted">{n.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className="h-full rounded-full bg-indigo-500"
                    style={{ width: `${totalNotice ? (n.tickets / totalNotice) * 100 : 0}%` }}
                  />
                </div>
                <span className="w-16 text-right font-data">{n.tickets}</span>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Motivos" description="Agrupados sin importar mayúsculas ni acentos" />
          <CardBody className="p-0">
            <ul className="divide-y divide-border text-sm">
              {data.reasons.map((r) => (
                <li key={r.reason} className="flex items-center gap-3 px-4 py-2">
                  <span className="flex-1">{r.reason}</span>
                  <span className="font-data text-fg-muted">{r.tickets} boletos</span>
                  <span className="w-28 text-right font-data">{formatMoney(r.amount)}</span>
                </li>
              ))}
              {!data.reasons.length && <li className="px-4 py-3 text-fg-muted">Sin cancelaciones del pasajero.</li>}
            </ul>
          </CardBody>
        </Card>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold tracking-wide text-fg-subtle uppercase">Por ruta</h2>
        <Table columns={routeCols} rows={data.byRoute} rowKey={(r) => r.routeId} />
        <p className="text-xs text-fg-muted">
          Ingreso de no presentados: lo cobrado por asientos que viajaron vacíos (no se reembolsa).
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <h2 className="text-sm font-semibold tracking-wide text-fg-subtle uppercase">
            Horarios con más no presentados
          </h2>
          <Table columns={scheduleCols} rows={data.bySchedule} rowKey={(s) => s.scheduleId} />
        </div>
        <Card>
          <CardHeader title="Reembolsos" description="Por origen y por método" />
          <CardBody className="space-y-4">
            <dl className="space-y-1 text-sm">
              {data.refunds.byKind.map((r) => (
                <div key={r.key} className="flex justify-between">
                  <dt className="text-fg-muted">
                    {KINDS[r.key]} ({r.tickets})
                  </dt>
                  <dd className="font-data">{formatMoney(r.amount)}</dd>
                </div>
              ))}
            </dl>
            <ShareDonut
              data={data.refunds.byMethod.map((m) => ({ name: METHOD_LABELS[m.key] ?? m.key, value: m.amount }))}
            />
          </CardBody>
        </Card>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold tracking-wide text-fg-subtle uppercase">
          Recorridos cancelados por la empresa
        </h2>
        <Table
          columns={tripCols}
          rows={data.companyTrips}
          rowKey={(t) => t.tripId}
          emptyIcon={Ban}
          emptyMessage="Ningún recorrido cancelado en el periodo"
        />
      </div>

      <Card>
        <CardHeader title="Cambios de boleto" description="Por la fecha del cambio" />
        <CardBody>
          <dl className="grid gap-3 text-sm sm:grid-cols-5">
            {(
              [
                ['Cambios', data.changes.count.toLocaleString('es-MX')],
                ['Reubicaciones', data.changes.relocations.toLocaleString('es-MX')],
                ['Diferencias cobradas', formatMoney(data.changes.collected)],
                ['Diferencias devueltas', formatMoney(data.changes.returned)],
                ['Cargos por cambio', formatMoney(data.changes.fees)],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-fg-muted">{label}</dt>
                <dd className="font-data text-lg font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>
    </div>
  )
}
