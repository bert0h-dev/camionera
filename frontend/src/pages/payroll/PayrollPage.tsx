import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Plus, Settings2, Wallet } from 'lucide-react'
import { api } from '../../lib/api'
import { formatDate, formatMoney } from '../../lib/format'
import {
  PAYMENT_FREQUENCY_LABELS,
  PAYROLL_STATUS_LABELS,
  type Paginated,
  type PayrollPeriod,
  type PayrollStatus,
} from '../../lib/types'
import { PayrollStatusBadge } from '../../components/PayrollStatusBadge'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Field'
import { FilterBar } from '../../components/ui/FilterBar'
import { HeroStat } from '../../components/ui/HeroStat'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination, Table, type Column } from '../../components/ui/Table'
import { NewPeriodModal } from './NewPeriodModal'
import { PayrollSettingsModal } from './PayrollSettingsModal'
import { usePayrollSettings } from './usePayrollSettings'

function PayrollPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<PayrollStatus | ''>('')
  const [creating, setCreating] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['payroll', 'periods', { page, status }],
    queryFn: async () =>
      (
        await api.get<Paginated<PayrollPeriod>>('/payroll/periods', {
          params: { page, status: status || undefined },
        })
      ).data,
    placeholderData: keepPreviousData,
  })
  // Para las cifras: los periodos más recientes, sin filtro
  const recent = useQuery({
    queryKey: ['payroll', 'periods', 'recent'],
    queryFn: async () =>
      (await api.get<Paginated<PayrollPeriod>>('/payroll/periods', { params: { limit: 8 } })).data.data,
  })
  const settings = usePayrollSettings()

  const periods = recent.data ?? []
  const drafts = periods.filter((p) => p.status === 'draft').length
  const lastClosed = periods.find((p) => p.status !== 'draft')
  const toPay = periods.filter((p) => p.status === 'closed')
  // Netos de los periodos cerrados, del más antiguo al más reciente
  const trend = periods
    .filter((p) => p.status !== 'draft')
    .map((p) => Number(p.netTotal))
    .reverse()

  const columns: Column<PayrollPeriod>[] = [
    { header: 'Periodo', cell: (p) => <span className="font-medium text-fg">{p.name}</span> },
    {
      header: 'Fechas',
      cell: (p) => (
        <span className="font-data text-xs text-fg-muted">
          {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}
        </span>
      ),
    },
    {
      header: 'Periodicidad',
      cell: (p) => <span className="text-fg-muted">{PAYMENT_FREQUENCY_LABELS[p.frequency]}</span>,
    },
    {
      header: 'Empleados',
      className: 'text-right',
      cell: (p) => <span className="font-data">{p.generatedAt ? p._count.entries : '—'}</span>,
    },
    {
      header: 'Neto',
      className: 'text-right',
      cell: (p) => (
        <span className="font-data font-semibold text-fg">{p.generatedAt ? formatMoney(p.netTotal) : '—'}</span>
      ),
    },
    { header: 'Estado', cell: (p) => <PayrollStatusBadge status={p.status} /> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nómina"
        description="Prenómina calculada desde las asistencias, lista para revisar y exportar"
        actions={
          <>
            <Button variant="glass" icon={Settings2} onClick={() => setSettingsOpen(true)}>
              Configuración
            </Button>
            <Button variant="accent" icon={Plus} onClick={() => setCreating(true)}>
              Nuevo periodo
            </Button>
          </>
        }
        refreshing={isFetching && !isLoading}
        stats={
          <>
            <HeroStat
              label="Último periodo cerrado"
              value={lastClosed ? formatMoney(lastClosed.netTotal) : '—'}
              hint={lastClosed?.name ?? 'aún no hay periodos cerrados'}
              trend={trend}
              loading={recent.isLoading}
              to={lastClosed && `/nomina/${lastClosed.id}`}
            />
            <HeroStat
              label="Por pagar"
              value={toPay.length}
              tone={toPay.length ? 'warning' : 'neutral'}
              hint={toPay.length ? formatMoney(toPay.reduce((t, p) => t + Number(p.netTotal), 0)) : 'nada pendiente'}
              loading={recent.isLoading}
            />
            <HeroStat
              label="En borrador"
              value={drafts}
              tone={drafts ? 'primary' : 'neutral'}
              hint="pendientes de cerrar"
              loading={recent.isLoading}
            />
            <HeroStat
              label="Retardos"
              value={
                settings.data
                  ? settings.data.latePenaltyEnabled
                    ? `${settings.data.latesPerAbsence} = 1 falta`
                    : 'Informativos'
                  : '—'
              }
              hint={settings.data?.latePenaltyEnabled ? 'se descuentan en la prenómina' : 'no afectan el pago'}
              loading={settings.isLoading}
            />
          </>
        }
      />

      <FilterBar className="justify-end">
        <div className="w-full sm:w-48">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as PayrollStatus | '')
              setPage(1)
            }}
          >
            <option value="">Todos los estados</option>
            {(Object.keys(PAYROLL_STATUS_LABELS) as PayrollStatus[]).map((s) => (
              <option key={s} value={s}>
                {PAYROLL_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
      </FilterBar>

      <Table
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(p) => p.id}
        loading={isLoading}
        refreshing={isFetching && !isLoading}
        onRowClick={(p) => navigate(`/nomina/${p.id}`)}
        emptyIcon={Wallet}
        emptyMessage="Aún no hay periodos de nómina"
        emptyDescription="Crea un periodo y genera la prenómina a partir de las asistencias."
        emptyAction={
          <Button icon={Plus} onClick={() => setCreating(true)}>
            Nuevo periodo
          </Button>
        }
      />
      {data && <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />}

      <NewPeriodModal open={creating} onClose={() => setCreating(false)} />
      <PayrollSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

export default PayrollPage
