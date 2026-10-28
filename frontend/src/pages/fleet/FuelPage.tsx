import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Fuel, Gauge, Plus } from 'lucide-react'
import { formatInstantDate, formatMoney } from '../../lib/format'
import type { FuelEfficiencyRow, FuelLoadStatus } from '../../lib/types'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { HeroStat } from '../../components/ui/HeroStat'
import { PageHeader } from '../../components/ui/PageHeader'
import { Table, type Column } from '../../components/ui/Table'
import { Tabs, type TabItem } from '../../components/ui/Tabs'
import { FuelLoadModal, type FuelPreset } from './FuelLoadModal'
import { FuelLoadsTable } from './FuelLoadsTable'
import { formatEfficiency, useFuelEfficiency, useFuelRole, useFuelSummary } from './useFleet'

type TabKey = 'loads' | 'efficiency'

/** Rendimiento por unidad: la última medición contra el esperado del modelo. */
function EfficiencyTab() {
  const navigate = useNavigate()
  const { data, isLoading } = useFuelEfficiency()
  // Primero las de rendimiento bajo, luego las que más caen
  const rows = [...(data ?? [])].sort(
    (a, b) => Number(b.low) - Number(a.low) || (b.dropPct ?? -999) - (a.dropPct ?? -999),
  )
  const columns: Column<FuelEfficiencyRow>[] = [
    { header: 'Unidad', cell: (r) => <span className="font-data font-semibold">{r.bus.economicNumber}</span> },
    { header: 'Esperado', cell: (r) => <span className="font-data">{formatEfficiency(r.expected, r.unit)}</span> },
    {
      header: 'Última medición',
      cell: (r) =>
        r.last === null ? (
          <span className="text-xs text-fg-muted">Sin tramo medido</span>
        ) : (
          <div>
            <div className="font-data font-semibold">{formatEfficiency(r.last, r.unit)}</div>
            <div className="text-xs text-fg-muted">{formatInstantDate(r.lastAt)}</div>
          </div>
        ),
    },
    {
      header: 'Promedio 90 días',
      cell: (r) => <span className="font-data">{formatEfficiency(r.average90, r.unit)}</span>,
    },
    {
      header: 'Variación',
      cell: (r) =>
        r.dropPct === null ? (
          <span className="text-fg-subtle">—</span>
        ) : (
          <span className="font-data">{r.dropPct > 0 ? `−${r.dropPct}` : `+${-r.dropPct}`} %</span>
        ),
    },
    {
      header: 'Estado',
      cell: (r) =>
        r.low ? (
          <Badge tone="danger" dot>
            Rendimiento bajo
          </Badge>
        ) : r.last === null ? (
          <Badge tone="neutral">Sin datos</Badge>
        ) : (
          <Badge tone="success" dot>
            Normal
          </Badge>
        ),
    },
  ]
  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        El rendimiento se mide de tanque lleno a tanque lleno. Una unidad se marca con rendimiento bajo cuando su última
        medición cae {data?.[0]?.threshold ?? 15} % o más por debajo del esperado de su modelo (se ajusta en
        Configuración → Parámetros → Flota).
      </p>
      <Table
        columns={columns}
        rows={rows}
        rowKey={(r) => r.bus.id}
        loading={isLoading}
        onRowClick={(r) => navigate(`/flota/unidades/${r.bus.id}?tab=fuel`)}
        rowClassName={(r) => r.low && 'bg-red-50/50 dark:bg-red-500/5'}
        emptyIcon={Gauge}
        emptyMessage="Aún no hay unidades"
      />
    </div>
  )
}

function FuelPage() {
  const { canRead, canRecord, isDriver } = useFuelRole()
  const [tab, setTab] = useState<TabKey>('loads')
  const [chosen, setChosen] = useState<FuelPreset | null>(null)
  const [params, setParams] = useSearchParams()
  // La acción rápida de Ctrl+K abre el registro con ?nueva=1; Inicio llega con ?status=pending
  const preset = chosen ?? (params.get('nueva') === '1' ? {} : null)
  const setPreset = (p: FuelPreset | null) => {
    setChosen(p)
    if (!p && params.has('nueva')) setParams({}, { replace: true })
  }
  const initialStatus = (params.get('status') ?? '') as FuelLoadStatus | ''
  const summary = useFuelSummary()
  const efficiency = useFuelEfficiency(undefined, canRead)
  const s = summary.data
  const threshold = efficiency.data?.[0]?.threshold

  const tabs: TabItem<TabKey>[] = [
    { key: 'loads', label: isDriver ? 'Mis cargas' : 'Cargas', icon: Fuel, badge: s?.pending || undefined },
    ...(canRead
      ? [{ key: 'efficiency' as const, label: 'Rendimiento', icon: Gauge, badge: s?.lowEfficiencyBuses || undefined }]
      : []),
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={isDriver ? 'Mis cargas de combustible' : 'Combustible'}
        description={
          isDriver
            ? 'Registra las cargas de la unidad; coordinación las confirma'
            : 'Cargas, gasto y rendimiento de la flota, medido de tanque lleno a tanque lleno'
        }
        actions={
          canRecord && (
            <Button variant="accent" icon={Plus} onClick={() => setPreset({})}>
              Registrar carga
            </Button>
          )
        }
        stats={
          <>
            <HeroStat
              label="Litros del mes"
              value={(s?.quantityThisMonth ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}
              tone="primary"
              loading={summary.isLoading}
              hint={`${s?.loadsThisMonth ?? 0} cargas confirmadas`}
            />
            <HeroStat
              label="Gasto del mes"
              value={formatMoney(s?.spendThisMonth ?? 0)}
              tone="neutral"
              loading={summary.isLoading}
              hint="cargas confirmadas"
            />
            <HeroStat
              label={isDriver ? 'Rechazadas del mes' : 'Rendimiento promedio'}
              value={isDriver ? (s?.rejectedThisMonth ?? 0) : formatEfficiency(s?.averageEfficiency ?? null)}
              tone={isDriver && s?.rejectedThisMonth ? 'danger' : 'info'}
              loading={summary.isLoading}
              hint={isDriver ? 'revisa el motivo' : 'tramos medidos este mes'}
            />
            <HeroStat
              label={isDriver ? 'Por confirmar' : 'Por confirmar · bajas'}
              value={isDriver ? (s?.pending ?? 0) : `${s?.pending ?? 0} · ${s?.lowEfficiencyBuses ?? 0}`}
              tone={s?.pending || s?.lowEfficiencyBuses ? 'warning' : 'neutral'}
              loading={summary.isLoading}
              hint={isDriver ? 'esperan a coordinación' : 'cargas · unidades con rendimiento bajo'}
            />
          </>
        }
        bottom={tabs.length > 1 && <Tabs variant="band" items={tabs} value={tab} onChange={setTab} />}
      />

      {tab === 'loads' && <FuelLoadsTable initialStatus={initialStatus} threshold={threshold} />}
      {tab === 'efficiency' && <EfficiencyTab />}

      <FuelLoadModal preset={preset} onClose={() => setPreset(null)} />
    </div>
  )
}

export default FuelPage
