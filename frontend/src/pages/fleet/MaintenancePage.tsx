import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, ClipboardList, ListChecks, Plus, Search, Wrench } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { formatDate, formatMoney } from '../../lib/format'
import {
  MAINTENANCE_STATUS_LABELS,
  MAINTENANCE_STATUSES,
  type MaintenanceOrderListItem,
  type MaintenanceStatus,
  type MaintenanceTaskTemplate,
  type MaintenanceType,
  type Paginated,
  type ServicePlanRow,
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
import { OrderStatusBadge, OrderTypeBadge, ServiceStatusBadge } from './MaintenanceBadges'
import { NewOrderModal, type NewOrderPreset } from './NewOrderModal'
import { orderFolio, useMaintenanceRole, useMaintenanceSummary, useServicePlan } from './useFleet'

type TabKey = 'orders' | 'plan' | 'templates'

const formatKm = (km: number) => `${km.toLocaleString('es-MX')} km`

/** "Faltan 3 días / 800 km" o "Vencido hace…" según lo que dispare el servicio. */
function remaining(row: ServicePlanRow) {
  const parts: string[] = []
  if (row.kmLeft !== null)
    parts.push(row.kmLeft < 0 ? `${formatKm(-row.kmLeft)} pasado` : `faltan ${formatKm(row.kmLeft)}`)
  if (row.daysLeft !== null)
    parts.push(
      row.daysLeft < 0
        ? `${-row.daysLeft} días pasado`
        : row.daysLeft === 0
          ? 'vence hoy'
          : `faltan ${row.daysLeft} días`,
    )
  return parts.join(' · ')
}

function OrdersTab({ isMechanic }: { isMechanic: boolean }) {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  // El mecánico arranca viendo lo que tiene por hacer
  const [status, setStatus] = useState<MaintenanceStatus | ''>(isMechanic ? 'scheduled' : '')
  const [type, setType] = useState<MaintenanceType | ''>('')

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['fleet', 'maintenance', 'orders', { page, search, status, type }],
    queryFn: async () =>
      (
        await api.get<Paginated<MaintenanceOrderListItem>>('/fleet/maintenance/orders', {
          params: {
            page,
            limit: 20,
            search: search || undefined,
            status: status || undefined,
            type: type || undefined,
          },
        })
      ).data,
    placeholderData: keepPreviousData,
  })

  const columns: Column<MaintenanceOrderListItem>[] = [
    {
      header: 'Orden',
      cell: (o) => (
        <div>
          <div className="font-data font-semibold">{orderFolio(o.folio)}</div>
          <div className="text-xs text-fg-muted">{formatDate(o.scheduledDate)}</div>
        </div>
      ),
    },
    {
      header: 'Unidad',
      cell: (o) => (
        <div>
          <div className="font-data font-semibold">{o.bus.economicNumber}</div>
          <div className="font-data text-xs text-fg-muted">{o.bus.plates}</div>
        </div>
      ),
    },
    {
      header: 'Trabajo',
      cell: (o) => (
        <div className="max-w-80">
          <div className="flex items-center gap-2">
            <OrderTypeBadge type={o.type} />
            {o.priority === 'urgent' && <Badge tone="danger">Urgente</Badge>}
          </div>
          <div className="mt-1 truncate text-sm">{o.description}</div>
        </div>
      ),
    },
    {
      header: 'Mecánico',
      cell: (o) => o.mechanic?.fullName ?? o.externalShop ?? <span className="text-fg-subtle">Sin asignar</span>,
    },
    {
      header: 'Tareas',
      cell: (o) =>
        o.tasksTotal ? (
          <span className="font-data">
            {o.tasksDone}/{o.tasksTotal}
          </span>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      header: 'Costo',
      cell: (o) =>
        o.status === 'completed' ? (
          <span className="font-data">{formatMoney(o.total)}</span>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    { header: 'Estado', cell: (o) => <OrderStatusBadge status={o.status} /> },
  ]

  const filtered = !!(search || status || type)
  return (
    <div className="space-y-4">
      <FilterBar>
        <div className="min-w-60 flex-1">
          <Input
            icon={Search}
            placeholder="Buscar por folio, unidad o descripción…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-44">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as MaintenanceStatus | '')
              setPage(1)
            }}
          >
            <option value="">Todos los estados</option>
            {MAINTENANCE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {MAINTENANCE_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-40">
          <Select
            value={type}
            onChange={(e) => {
              setType(e.target.value as MaintenanceType | '')
              setPage(1)
            }}
          >
            <option value="">Todos los tipos</option>
            <option value="preventive">Preventivo</option>
            <option value="corrective">Correctivo</option>
          </Select>
        </div>
      </FilterBar>
      <Table
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(o) => o.id}
        onRowClick={(o) => navigate(`/flota/mantenimiento/${o.id}`)}
        loading={isLoading}
        refreshing={isFetching && !isLoading}
        rowClassName={(o) => o.status === 'cancelled' && 'opacity-60'}
        emptyIcon={Wrench}
        emptyMessage={filtered ? 'Ninguna orden coincide con los filtros' : 'Aún no hay órdenes de mantenimiento'}
      />
      {data && <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />}
    </div>
  )
}

function PlanTab({ onSchedule, canManage }: { onSchedule: (p: NewOrderPreset) => void; canManage: boolean }) {
  const { data, isLoading } = useServicePlan()
  const columns: Column<ServicePlanRow>[] = [
    {
      header: 'Unidad',
      cell: (r) => (
        <Link to={`/flota/unidades/${r.bus.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
          <div className="font-data font-semibold">{r.bus.economicNumber}</div>
          <div className="text-xs text-fg-muted">
            {r.bus.model} · {r.bus.terminal}
          </div>
        </Link>
      ),
    },
    { header: 'Odómetro', cell: (r) => <span className="font-data">{formatKm(r.bus.odometerKm)}</span> },
    {
      header: 'Último preventivo',
      cell: (r) =>
        r.lastServiceAt ? (
          <div className="text-sm">
            <div>{formatDate(r.lastServiceAt)}</div>
            <div className="font-data text-xs text-fg-muted">{formatKm(r.lastServiceKm ?? 0)}</div>
          </div>
        ) : (
          <span className="text-xs text-fg-muted">Desde el alta</span>
        ),
    },
    {
      header: 'Próximo',
      cell: (r) =>
        r.status === 'no_plan' ? (
          <span className="text-fg-subtle">—</span>
        ) : (
          <div className="text-sm">
            <div>
              {r.dueDate && formatDate(r.dueDate)}
              {r.dueDate && r.dueKm !== null && ' o '}
              {r.dueKm !== null && <span className="font-data">{formatKm(r.dueKm)}</span>}
            </div>
            <div className="text-xs text-fg-muted">{remaining(r)}</div>
          </div>
        ),
    },
    { header: 'Estado', cell: (r) => <ServiceStatusBadge status={r.status} /> },
    {
      header: '',
      cell: (r) =>
        r.openOrder ? (
          <Link
            to={`/flota/mantenimiento/${r.openOrder.id}`}
            className="font-data text-sm text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {orderFolio(r.openOrder.folio)}
          </Link>
        ) : (
          canManage &&
          r.status !== 'no_plan' && (
            <Button
              variant="ghost"
              size="sm"
              icon={CalendarClock}
              onClick={() =>
                onSchedule({
                  busId: r.bus.id,
                  type: 'preventive',
                  description: r.plan.km ? `Servicio preventivo de ${formatKm(r.plan.km)}` : 'Servicio preventivo',
                })
              }
            >
              Programar
            </Button>
          )
        ),
    },
  ]
  return (
    <Table
      columns={columns}
      rows={data ?? []}
      rowKey={(r) => r.bus.id}
      loading={isLoading}
      rowClassName={(r) => r.status === 'overdue' && 'bg-red-50/50 dark:bg-red-500/5'}
      emptyIcon={CalendarClock}
      emptyMessage="No hay unidades activas"
    />
  )
}

function TemplatesTab({ canManage }: { canManage: boolean }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [description, setDescription] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['fleet', 'maintenance', 'templates'],
    queryFn: async () =>
      (
        await api.get<MaintenanceTaskTemplate[]>('/fleet/maintenance/task-templates', {
          params: { includeInactive: true },
        })
      ).data,
  })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['fleet', 'maintenance', 'templates'] })
  const add = useMutation({
    mutationFn: () => api.post('/fleet/maintenance/task-templates', { description }),
    onSuccess: () => {
      setDescription('')
      invalidate()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })
  const toggle = useMutation({
    mutationFn: (t: MaintenanceTaskTemplate) =>
      api.patch(`/fleet/maintenance/task-templates/${t.id}`, { isActive: !t.isActive }),
    onSuccess: invalidate,
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const columns: Column<MaintenanceTaskTemplate>[] = [
    { header: '#', cell: (t) => <span className="font-data text-fg-muted">{t.sortOrder}</span> },
    { header: 'Tarea', cell: (t) => <span className={t.isActive ? '' : 'line-through'}>{t.description}</span> },
    {
      header: 'Estado',
      cell: (t) => (
        <Badge tone={t.isActive ? 'success' : 'neutral'} dot>
          {t.isActive ? 'Activa' : 'Inactiva'}
        </Badge>
      ),
    },
    {
      header: '',
      cell: (t) =>
        canManage && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => toggle.mutate(t)}>
              {t.isActive ? 'Desactivar' : 'Activar'}
            </Button>
          </div>
        ),
    },
  ]

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        Cada orden preventiva nueva arranca con estas tareas activas; en la orden se pueden agregar más.
      </p>
      {canManage && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            add.mutate()
          }}
        >
          <div className="flex-1">
            <Input
              placeholder="Nueva tarea base…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <Button type="submit" icon={Plus} loading={add.isPending} disabled={description.trim().length < 2}>
            Agregar
          </Button>
        </form>
      )}
      <Table
        columns={columns}
        rows={data ?? []}
        rowKey={(t) => t.id}
        loading={isLoading}
        rowClassName={(t) => !t.isActive && 'opacity-60'}
        emptyIcon={ListChecks}
        emptyMessage="Sin tareas base"
      />
    </div>
  )
}

function MaintenancePage() {
  const { isMechanic, canManage } = useMaintenanceRole()
  const [tab, setTab] = useState<TabKey>('orders')
  const [chosen, setChosen] = useState<NewOrderPreset | null>(null)
  const [params, setParams] = useSearchParams()
  // La acción rápida de Ctrl+K abre el alta con ?nueva=1
  const preset = chosen ?? (canManage && params.get('nueva') === '1' ? {} : null)
  const setPreset = (p: NewOrderPreset | null) => {
    setChosen(p)
    if (!p && params.has('nueva')) setParams({}, { replace: true })
  }
  const summary = useMaintenanceSummary()
  const s = summary.data

  const tabs: TabItem<TabKey>[] = [
    { key: 'orders', label: isMechanic ? 'Mis órdenes' : 'Órdenes', icon: ClipboardList },
    ...(isMechanic
      ? []
      : [
          {
            key: 'plan' as const,
            label: 'Plan preventivo',
            icon: CalendarClock,
            badge: (s?.overdue ?? 0) + (s?.dueSoon ?? 0) || undefined,
          },
        ]),
    { key: 'templates', label: 'Tareas base', icon: ListChecks },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mantenimiento"
        description={
          isMechanic
            ? 'Órdenes asignadas a ti o sin asignar'
            : 'Plan preventivo por km y días, y órdenes de trabajo del taller'
        }
        actions={
          canManage && (
            <Button variant="accent" icon={Plus} onClick={() => setPreset({})}>
              Nueva orden
            </Button>
          )
        }
        stats={
          <>
            {!isMechanic && (
              <>
                <HeroStat
                  label="Preventivos vencidos"
                  value={s?.overdue ?? 0}
                  tone={s?.overdue ? 'danger' : 'neutral'}
                  loading={summary.isLoading}
                  hint="por km o por días"
                />
                <HeroStat
                  label="Próximos"
                  value={s?.dueSoon ?? 0}
                  tone={s?.dueSoon ? 'warning' : 'neutral'}
                  loading={summary.isLoading}
                  hint="programarlos pronto"
                />
              </>
            )}
            <HeroStat
              label="En proceso"
              value={s?.inProgress ?? 0}
              tone="primary"
              loading={summary.isLoading}
              hint={`${s?.scheduled ?? 0} programada(s)`}
            />
            <HeroStat
              label="Gasto del mes"
              value={formatMoney(s?.costThisMonth ?? 0)}
              loading={summary.isLoading}
              hint={`${s?.completedThisMonth ?? 0} orden(es) terminada(s)`}
            />
          </>
        }
        bottom={<Tabs variant="band" items={tabs} value={tab} onChange={setTab} />}
      />

      {tab === 'orders' && <OrdersTab isMechanic={isMechanic} />}
      {tab === 'plan' && <PlanTab canManage={canManage} onSchedule={setPreset} />}
      {tab === 'templates' && <TemplatesTab canManage={canManage} />}

      <NewOrderModal preset={preset} onClose={() => setPreset(null)} />
    </div>
  )
}

export default MaintenancePage
