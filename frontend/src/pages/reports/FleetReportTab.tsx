import { Link } from 'react-router-dom'
import { Bus } from 'lucide-react'
import { apiErrorMessage } from '../../lib/api'
import { formatMoney } from '../../lib/format'
import type { FleetReport } from '../../lib/types'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { HeroStat } from '../../components/ui/HeroStat'
import { LoadingBlock } from '../../components/ui/Spinner'
import { Table, type Column } from '../../components/ui/Table'
import { RankingBars } from './charts'
import type { useFleetReport } from './useReports'

const SEVERITY: Record<string, string> = { low: 'Baja', medium: 'Media', high: 'Alta', critical: 'Crítica' }
const money = (v: number | null) => (v == null ? '—' : formatMoney(v))

export function FleetStats({ data, loading }: { data?: FleetReport; loading: boolean }) {
  const k = data?.summary
  return (
    <>
      <HeroStat
        label="Km recorridos"
        value={(k?.km ?? 0).toLocaleString('es-MX')}
        tone="primary"
        loading={loading}
        hint={k ? `${k.trips} recorridos · ${k.activeBuses} unidades` : undefined}
      />
      <HeroStat
        label="Rendimiento"
        value={k?.efficiency == null ? '—' : `${k.efficiency} km/L`}
        tone={k?.lowEfficiency ? 'warning' : 'neutral'}
        loading={loading}
        hint={k ? `${k.lowEfficiency} unidad(es) con rendimiento bajo` : undefined}
      />
      <HeroStat
        label="Costo por km"
        value={money(k?.costPerKm ?? null)}
        loading={loading}
        hint={k ? `combustible ${formatMoney(k.fuelCost)} + taller ${formatMoney(k.maintenanceCost)}` : undefined}
      />
      <HeroStat
        label="Preventivo"
        value={k?.preventiveCompliance == null ? '—' : `${k.preventiveCompliance} %`}
        tone={k?.preventiveOverdue ? 'warning' : 'neutral'}
        loading={loading}
        hint={
          k ? `${k.preventiveDone} de ${k.preventivePlanned} hechos · ${k.preventiveOverdue} vencido(s)` : undefined
        }
      />
    </>
  )
}

export function FleetReportTab({ query }: { query: ReturnType<typeof useFleetReport> }) {
  const { data, isLoading, error } = query
  if (isLoading) return <LoadingBlock text="Calculando flota…" />
  if (!data) return <Alert tone="danger">{apiErrorMessage(error)}</Alert>
  if (!data.byBus.length) return <EmptyState icon={Bus} title="Sin actividad de la flota en el periodo" />

  const cols: Column<FleetReport['byBus'][number]>[] = [
    {
      header: 'Unidad',
      cell: (b) => (
        <Link to={`/flota/unidades/${b.busId}`} className="hover:underline">
          <span className="font-data font-semibold">{b.number}</span>
          <span className="block text-xs text-fg-muted">{b.model}</span>
        </Link>
      ),
    },
    { header: 'Recorridos', cell: (b) => <span className="font-data">{b.trips}</span> },
    {
      header: 'Km',
      cell: (b) => (
        <span className="font-data" title={b.kmEstimated ? `${b.kmEstimated} km estimados por la ruta` : undefined}>
          {b.km.toLocaleString('es-MX')}
          {b.kmEstimated > 0 && <span className="text-fg-subtle">*</span>}
        </span>
      ),
    },
    {
      header: 'Rendimiento',
      cell: (b) =>
        b.efficiency == null ? (
          <span className="text-fg-subtle">—</span>
        ) : (
          <span className="flex items-center gap-2">
            <span className="font-data">{b.efficiency} km/L</span>
            {b.efficiencyGap != null && b.efficiencyGap <= -15 ? (
              <Badge tone="danger">{b.efficiencyGap} %</Badge>
            ) : (
              b.efficiencyGap != null && <span className="text-xs text-fg-muted">{b.efficiencyGap} %</span>
            )}
          </span>
        ),
    },
    { header: 'Combustible', cell: (b) => <span className="font-data">{formatMoney(b.fuelCost)}</span> },
    {
      header: 'Taller',
      cell: (b) => (
        <span className="font-data" title={`${b.preventive} preventivo(s) · ${b.corrective} correctivo(s)`}>
          {formatMoney(b.maintenanceCost)}
          {b.daysInShop > 0 && <span className="block text-xs text-fg-muted">{b.daysInShop} días</span>}
        </span>
      ),
    },
    { header: 'Costo/km', cell: (b) => <span className="font-data font-semibold">{money(b.costPerKm)}</span> },
    {
      header: 'Incidencias',
      cell: (b) =>
        b.incidents ? (
          <Badge tone={b.criticalIncidents ? 'danger' : 'warning'}>{b.incidents}</Badge>
        ) : (
          <span className="text-fg-subtle">0</span>
        ),
    },
  ]

  return (
    <div className="space-y-6">
      <Alert tone="info">
        Km de los recorridos terminados por su odómetro de salida y llegada; si falta, se toman los km de la ruta y se
        marcan con <span className="font-data">*</span>. El rendimiento se mide entre llenos de tanque (como en
        Combustible) y el costo por km suma combustible y taller.
      </Alert>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Costo por km por unidad" description="Combustible + mantenimiento entre km recorridos" />
          <CardBody>
            <RankingBars
              data={data.byBus
                .filter((b) => b.costPerKm != null)
                .sort((a, b) => (b.costPerKm ?? 0) - (a.costPerKm ?? 0))
                .map((b) => ({ name: b.number, value: b.costPerKm ?? 0 }))}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Incidencias"
            description={
              data.summary.avgResolutionHours == null
                ? 'Sin incidencias resueltas'
                : `Resolución promedio: ${data.summary.avgResolutionHours} h`
            }
          />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <dl className="space-y-1 text-sm">
              {data.incidentsBySeverity.map((s) => (
                <div key={s.severity} className="flex justify-between">
                  <dt className="text-fg-muted">{SEVERITY[s.severity]}</dt>
                  <dd className="font-data">{s.incidents}</dd>
                </div>
              ))}
            </dl>
            <dl className="space-y-1 text-sm">
              {data.incidentsByCategory.map((c) => (
                <div key={c.category} className="flex justify-between">
                  <dt className="text-fg-muted">{c.category}</dt>
                  <dd className="font-data">{c.incidents}</dd>
                </div>
              ))}
              {!data.incidentsByCategory.length && <p className="text-fg-muted">Sin incidencias.</p>}
            </dl>
          </CardBody>
        </Card>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold tracking-wide text-fg-subtle uppercase">Por unidad</h2>
        <Table columns={cols} rows={data.byBus} rowKey={(b) => b.busId} />
        {data.idle.length > 0 && (
          <p className="text-xs text-fg-muted">
            Sin recorridos en el periodo: {data.idle.map((b) => b.number).join(', ')}
          </p>
        )}
      </div>
    </div>
  )
}
