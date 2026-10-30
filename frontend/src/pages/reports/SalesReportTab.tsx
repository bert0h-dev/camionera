import { BarChart3 } from 'lucide-react'
import { apiErrorMessage } from '../../lib/api'
import { formatMoney } from '../../lib/format'
import type { SalesReport } from '../../lib/types'
import { Alert } from '../../components/ui/Alert'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { HeroStat } from '../../components/ui/HeroStat'
import { LoadingBlock } from '../../components/ui/Spinner'
import { Table, type Column } from '../../components/ui/Table'
import { METHOD_LABELS } from '../tickets/useTickets'
import { DailySalesChart, RankingBars, ShareDonut } from './charts'
import type { useSalesReport } from './useReports'

const CHANNELS: Record<string, string> = { counter: 'Taquilla', online: 'En línea' }

const trend = (v: number | null) =>
  v == null ? 'sin datos del periodo anterior' : `${v > 0 ? '+' : ''}${v} % contra el periodo anterior`

/** Cifras para la banda de la página (las calcula la pestaña de ventas). */
export function SalesStats({ data, loading }: { data?: SalesReport; loading: boolean }) {
  const k = data?.summary
  return (
    <>
      <HeroStat
        label="Neto"
        value={formatMoney(k?.net ?? 0)}
        tone="primary"
        loading={loading}
        hint={k ? trend(k.change.net) : undefined}
      />
      <HeroStat
        label="Vendido"
        value={formatMoney(k?.gross ?? 0)}
        loading={loading}
        hint={k ? trend(k.change.gross) : undefined}
      />
      <HeroStat
        label="Reembolsos"
        value={formatMoney(k?.refunds ?? 0)}
        tone={k?.refunds ? 'warning' : 'neutral'}
        loading={loading}
        hint="en su propia fecha"
      />
      <HeroStat
        label="Boletos"
        value={(k?.tickets ?? 0).toLocaleString('es-MX')}
        loading={loading}
        hint={k ? `${k.orders} compras · promedio ${formatMoney(k.avgTicket)}` : undefined}
      />
    </>
  )
}

export function SalesReportTab({ query }: { query: ReturnType<typeof useSalesReport> }) {
  const { data, isLoading, error } = query
  if (isLoading) return <LoadingBlock text="Calculando ventas…" />
  if (!data) return <Alert tone="danger">{apiErrorMessage(error)}</Alert>
  if (!data.summary.tickets && !data.summary.gross && !data.summary.refunds)
    return (
      <EmptyState
        icon={BarChart3}
        title="Sin ventas en el periodo"
        description="Prueba con otro periodo o quita los filtros"
      />
    )

  const sellerCols: Column<SalesReport['bySeller'][number]>[] = [
    { header: 'Vendedor', cell: (s) => <span className="font-medium">{s.name}</span> },
    { header: 'Compras', cell: (s) => <span className="font-data">{s.orders}</span> },
    { header: 'Vendido', cell: (s) => <span className="font-data">{formatMoney(s.gross)}</span> },
    { header: 'Reembolsos', cell: (s) => <span className="font-data">{formatMoney(s.refunds)}</span> },
    { header: 'Neto', cell: (s) => <span className="font-data font-semibold">{formatMoney(s.net)}</span> },
    {
      header: `Comisión (${data.vendorPercent} %)`,
      cell: (s) => <span className="font-data">{formatMoney(s.commission)}</span>,
    },
  ]
  const routeCols: Column<SalesReport['byRoute'][number]>[] = [
    {
      header: 'Ruta',
      cell: (r) => (
        <div>
          <div className="font-medium">{r.name}</div>
          <div className="font-data text-xs text-fg-muted">{r.code}</div>
        </div>
      ),
    },
    { header: 'Boletos', cell: (r) => <span className="font-data">{r.tickets}</span> },
    { header: 'Importe', cell: (r) => <span className="font-data">{formatMoney(r.revenue)}</span> },
    { header: '% del total', cell: (r) => <span className="font-data">{r.share} %</span> },
  ]
  const typeCols: Column<SalesReport['byPassengerType'][number]>[] = [
    { header: 'Tipo de pasajero', cell: (t) => t.type },
    { header: 'Boletos', cell: (t) => <span className="font-data">{t.tickets}</span> },
    { header: 'Descuento', cell: (t) => <span className="font-data">{formatMoney(t.discount)}</span> },
    { header: 'Importe', cell: (t) => <span className="font-data">{formatMoney(t.revenue)}</span> },
  ]
  const promoCols: Column<SalesReport['byPromotion'][number]>[] = [
    {
      header: 'Promoción',
      cell: (p) => (
        <span>
          <span className="font-data font-semibold">{p.code}</span> · {p.name}
        </span>
      ),
    },
    { header: 'Compras', cell: (p) => <span className="font-data">{p.orders}</span> },
    { header: 'Descuento', cell: (p) => <span className="font-data">{formatMoney(p.discount)}</span> },
  ]

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Ventas por día"
          description={`Vendido por fecha de cobro y reembolsos en la fecha en que se hicieron (zona ${data.range.timezone})`}
        />
        <CardBody>
          <DailySalesChart data={data.days} />
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Por método de pago" description="Ventas menos reembolsos" />
          <CardBody>
            <ShareDonut
              data={data.byMethod.map((m) => ({ name: METHOD_LABELS[m.method] ?? m.method, value: m.net }))}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Rutas con más ingreso" description="Importe de los boletos vendidos en el periodo" />
          <CardBody>
            <RankingBars data={data.byRoute.slice(0, 8).map((r) => ({ name: r.code, value: r.revenue }))} />
          </CardBody>
        </Card>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold tracking-wide text-fg-subtle uppercase">Por vendedor</h2>
        <Table columns={sellerCols} rows={data.bySeller} rowKey={(s) => s.sellerId ?? 'online'} />
        <p className="text-xs text-fg-muted">
          Los reembolsos se cuentan a quien los hizo, como en su caja. La comisión es estimada con el porcentaje
          vigente; la congelada de cada corte está en Venta › Caja.
        </p>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold tracking-wide text-fg-subtle uppercase">Por ruta</h2>
        <Table columns={routeCols} rows={data.byRoute} rowKey={(r) => r.routeId} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Origen → destino más vendidos" description="Incluye los tramos de rutas con paradas" />
          <CardBody className="p-0">
            <ul className="divide-y divide-border text-sm">
              {data.byLeg.map((l) => (
                <li key={l.leg} className="flex items-center gap-3 px-4 py-2">
                  <span className="flex-1">{l.leg}</span>
                  <span className="font-data text-fg-muted">{l.tickets} boletos</span>
                  <span className="w-28 text-right font-data">{formatMoney(l.revenue)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Por canal"
            description={
              data.byChannel.length < 2 ? 'Hoy solo se vende en taquilla (la venta en línea está pospuesta)' : undefined
            }
          />
          <CardBody>
            <dl className="space-y-1 text-sm">
              {data.byChannel.map((c) => (
                <div key={c.channel} className="flex justify-between">
                  <dt className="text-fg-muted">{CHANNELS[c.channel]}</dt>
                  <dd className="font-data font-semibold">{formatMoney(c.gross)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-border pt-1">
                <dt className="text-fg-muted">IVA contenido en los boletos</dt>
                <dd className="font-data">{formatMoney(data.summary.vat)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-fg-muted">Descuentos por tipo de pasajero</dt>
                <dd className="font-data">{formatMoney(data.summary.passengerDiscounts)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-fg-muted">Descuentos por promoción</dt>
                <dd className="font-data">{formatMoney(data.summary.promoDiscounts)}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <h2 className="text-sm font-semibold tracking-wide text-fg-subtle uppercase">Por tipo de pasajero</h2>
          <Table columns={typeCols} rows={data.byPassengerType} rowKey={(t) => t.type} />
        </div>
        <div className="space-y-2">
          <h2 className="text-sm font-semibold tracking-wide text-fg-subtle uppercase">Por promoción</h2>
          <Table
            columns={promoCols}
            rows={data.byPromotion}
            rowKey={(p) => p.code}
            emptyIcon={BarChart3}
            emptyMessage="Sin promociones en el periodo"
          />
        </div>
      </div>
    </div>
  )
}
