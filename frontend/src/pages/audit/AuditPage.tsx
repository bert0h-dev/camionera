import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { Download, History, ScrollText, Search, ShieldAlert } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { describeDevice } from '../../lib/device'
import {
  SECURITY_EVENT_LABELS,
  type AuditFilters,
  type AuditLogEntry,
  type AuditSummary,
  type Paginated,
  type SecurityEventEntry,
  type SecurityEventType,
} from '../../lib/types'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Field'
import { FilterBar } from '../../components/ui/FilterBar'
import { HeroStat } from '../../components/ui/HeroStat'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination, Table, type Column } from '../../components/ui/Table'
import { Tabs, type TabItem } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/toast-context'
import { ACTION_META, DATE_TIME, EVENT_TONES, FAILED_REASONS } from './auditMeta'
import { ChangeDiffModal } from './ChangeDiffModal'

type TabKey = 'changes' | 'security'

const TABS: TabItem<TabKey>[] = [
  { key: 'changes', label: 'Cambios de datos', icon: History },
  { key: 'security', label: 'Seguridad de acceso', icon: ShieldAlert },
]

interface RangeFilters {
  from: string
  to: string
  userId: string
}

function AuditPage() {
  const [tab, setTab] = useState<TabKey>('changes')
  const [range, setRange] = useState<RangeFilters>({ from: '', to: '', userId: '' })

  const summary = useQuery({
    queryKey: ['audit', 'summary'],
    queryFn: async () => (await api.get<AuditSummary>('/audit/summary')).data,
  })
  const filters = useQuery({
    queryKey: ['audit', 'filters'],
    queryFn: async () => (await api.get<AuditFilters>('/audit/filters')).data,
  })
  const s = summary.data

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bitácora"
        description={`Quién cambió qué y cuándo, y todos los accesos al sistema. Se conserva ${s?.retentionDays ?? '…'} días.`}
        stats={
          <>
            <HeroStat
              label="Cambios en 24 h"
              value={s?.changes ?? 0}
              loading={summary.isLoading}
              hint="altas, cambios y bajas"
            />
            <HeroStat
              label="Inicios de sesión"
              value={s?.logins ?? 0}
              tone="success"
              loading={summary.isLoading}
              hint="exitosos en 24 h"
            />
            <HeroStat
              label="Intentos fallidos"
              value={s?.failed ?? 0}
              tone={s?.failed ? 'warning' : 'neutral'}
              loading={summary.isLoading}
              hint="en las últimas 24 h"
            />
            <HeroStat
              label="Cuentas bloqueadas"
              value={s?.locked ?? 0}
              tone={s?.locked ? 'danger' : 'neutral'}
              loading={summary.isLoading}
              hint="por intentos fallidos en 24 h"
            />
          </>
        }
      />

      <Tabs items={TABS} value={tab} onChange={setTab} className="border-b border-border" />

      {tab === 'changes' ? (
        <ChangesTab range={range} setRange={setRange} filters={filters.data} />
      ) : (
        <SecurityTab range={range} setRange={setRange} filters={filters.data} />
      )}
    </div>
  )
}

/** Filtros comunes: usuario y rango de fechas. */
function RangeFields({
  range,
  setRange,
  filters,
}: {
  range: RangeFilters
  setRange: (r: RangeFilters) => void
  filters?: AuditFilters
}) {
  return (
    <>
      <div className="w-full sm:w-56">
        <Select value={range.userId} onChange={(e) => setRange({ ...range, userId: e.target.value })}>
          <option value="">Todos los usuarios</option>
          {filters?.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-full sm:w-40">
        <Input
          type="date"
          aria-label="Desde"
          value={range.from}
          max={range.to || undefined}
          onChange={(e) => setRange({ ...range, from: e.target.value })}
        />
      </div>
      <div className="w-full sm:w-40">
        <Input
          type="date"
          aria-label="Hasta"
          value={range.to}
          min={range.from || undefined}
          onChange={(e) => setRange({ ...range, to: e.target.value })}
        />
      </div>
    </>
  )
}

const clean = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== undefined))

function ChangesTab({
  range,
  setRange,
  filters,
}: {
  range: RangeFilters
  setRange: (r: RangeFilters) => void
  filters?: AuditFilters
}) {
  const toast = useToast()
  const [page, setPage] = useState(1)
  const [tableName, setTableName] = useState('')
  const [actionType, setActionType] = useState('')
  const [selected, setSelected] = useState<AuditLogEntry | null>(null)
  const params = clean({ ...range, tableName, actionType })

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['audit', 'logs', params, page],
    queryFn: async () =>
      (await api.get<Paginated<AuditLogEntry>>('/audit/logs', { params: { ...params, page, limit: 25 } })).data,
    placeholderData: keepPreviousData,
  })

  const exporter = useMutation({
    mutationFn: async () => {
      const res = await api.get<Blob>('/audit/logs/export', { params, responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'bitacora.csv'
      a.click()
      URL.revokeObjectURL(url)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo exportar')),
  })

  const columns: Column<AuditLogEntry>[] = [
    {
      header: 'Fecha',
      cell: (e) => (
        <span className="font-data text-xs whitespace-nowrap text-fg-muted">
          {DATE_TIME.format(new Date(e.createdAt))}
        </span>
      ),
    },
    {
      header: 'Usuario',
      cell: (e) => (
        <span className="text-fg">{e.user?.fullName ?? <span className="text-fg-subtle">Sistema</span>}</span>
      ),
    },
    {
      header: 'Acción',
      cell: (e) => (
        <Badge tone={ACTION_META[e.actionType].tone} dot>
          {ACTION_META[e.actionType].label}
        </Badge>
      ),
    },
    { header: 'Tabla', cell: (e) => <span className="font-data text-xs">{e.tableName}</span> },
    {
      header: 'Campos',
      cell: (e) => {
        const keys = Object.keys({ ...(e.oldValues ?? {}), ...(e.newValues ?? {}) }).filter(
          (k) => k !== 'updatedAt' && k !== 'createdAt',
        )
        return (
          <span className="block max-w-72 truncate text-xs text-fg-muted" title={keys.join(', ')}>
            {keys.slice(0, 4).join(', ')}
            {keys.length > 4 && ` +${keys.length - 4}`}
          </span>
        )
      },
    },
  ]

  return (
    <div className="space-y-4">
      <FilterBar>
        <RangeFields
          range={range}
          setRange={(r) => {
            setRange(r)
            setPage(1)
          }}
          filters={filters}
        />
        <div className="w-full sm:w-48">
          <Select
            value={tableName}
            onChange={(e) => {
              setTableName(e.target.value)
              setPage(1)
            }}
          >
            <option value="">Todas las tablas</option>
            {filters?.tables.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} ({t.count})
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-36">
          <Select
            value={actionType}
            onChange={(e) => {
              setActionType(e.target.value)
              setPage(1)
            }}
          >
            <option value="">Toda acción</option>
            <option value="insert">Altas</option>
            <option value="update">Cambios</option>
            <option value="delete">Bajas</option>
          </Select>
        </div>
        <Button variant="secondary" icon={Download} loading={exporter.isPending} onClick={() => exporter.mutate()}>
          CSV
        </Button>
      </FilterBar>

      <Table
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(e) => e.id}
        loading={isLoading}
        refreshing={isFetching && !isLoading}
        onRowClick={setSelected}
        emptyIcon={ScrollText}
        emptyMessage="Sin cambios con estos filtros"
      />
      {data && <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />}
      <ChangeDiffModal entry={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

function SecurityTab({
  range,
  setRange,
  filters,
}: {
  range: RangeFilters
  setRange: (r: RangeFilters) => void
  filters?: AuditFilters
}) {
  const [page, setPage] = useState(1)
  const [type, setType] = useState('')
  const [search, setSearch] = useState('')
  const params = clean({ ...range, type, search })

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['audit', 'security', params, page],
    queryFn: async () =>
      (
        await api.get<Paginated<SecurityEventEntry>>('/audit/security-events', {
          params: { ...params, page, limit: 25 },
        })
      ).data,
    placeholderData: keepPreviousData,
  })

  const columns: Column<SecurityEventEntry>[] = [
    {
      header: 'Fecha',
      cell: (e) => (
        <span className="font-data text-xs whitespace-nowrap text-fg-muted">
          {DATE_TIME.format(new Date(e.createdAt))}
        </span>
      ),
    },
    {
      header: 'Evento',
      cell: (e) => (
        <div>
          <Badge tone={EVENT_TONES[e.type]} dot>
            {SECURITY_EVENT_LABELS[e.type]}
          </Badge>
          {e.type === 'login_failed' && typeof e.details?.reason === 'string' && (
            <div className="mt-0.5 text-xs text-fg-muted">{FAILED_REASONS[e.details.reason] ?? e.details.reason}</div>
          )}
        </div>
      ),
    },
    {
      header: 'Usuario',
      cell: (e) => (
        <div className="min-w-0">
          <div className="truncate text-fg">
            {e.user?.fullName ?? <span className="text-fg-subtle">Sin cuenta</span>}
          </div>
          {e.email && <div className="truncate text-xs text-fg-muted">{e.email}</div>}
        </div>
      ),
    },
    { header: 'IP', cell: (e) => <span className="font-data text-xs">{e.ipAddress ?? '—'}</span> },
    {
      header: 'Dispositivo',
      cell: (e) => <span className="text-xs text-fg-muted">{e.userAgent ? describeDevice(e.userAgent) : '—'}</span>,
    },
  ]

  return (
    <div className="space-y-4">
      <FilterBar>
        <div className="min-w-56 flex-1">
          <Input
            icon={Search}
            placeholder="Correo o IP…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <RangeFields
          range={range}
          setRange={(r) => {
            setRange(r)
            setPage(1)
          }}
          filters={filters}
        />
        <div className="w-full sm:w-52">
          <Select
            value={type}
            onChange={(e) => {
              setType(e.target.value)
              setPage(1)
            }}
          >
            <option value="">Todos los eventos</option>
            {(Object.keys(SECURITY_EVENT_LABELS) as SecurityEventType[]).map((t) => (
              <option key={t} value={t}>
                {SECURITY_EVENT_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
      </FilterBar>

      <Table
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(e) => e.id}
        loading={isLoading}
        refreshing={isFetching && !isLoading}
        rowClassName={(e) =>
          (e.type === 'account_locked' || e.type === 'token_reuse') && 'bg-red-50/70 dark:bg-red-500/10'
        }
        emptyIcon={ShieldAlert}
        emptyMessage="Sin eventos con estos filtros"
      />
      {data && <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />}
    </div>
  )
}

export default AuditPage
