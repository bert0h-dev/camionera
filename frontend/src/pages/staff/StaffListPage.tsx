import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { KeyRound, Plus, Search, Users } from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { formatTime, staffFullName } from '../../lib/format'
import {
  STAFF_ROLE_LABELS,
  STAFF_ROLES,
  STAFF_STATUS_LABELS,
  STAFF_STATUSES,
  type Paginated,
  type StaffRole,
  type StaffStats,
  type StaffStatus,
  type StaffWithInsights,
  type TodayState,
} from '../../lib/types'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Field'
import { FilterBar } from '../../components/ui/FilterBar'
import { HeroStat } from '../../components/ui/HeroStat'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination, Table, type Column } from '../../components/ui/Table'
import { StaffStatusBadge } from './StaffStatusBadge'
import { useCanEditStaff } from './useCanEditStaff'

const TODAY: Record<TodayState, { label: string; className: string }> = {
  none: { label: 'Sin turno', className: 'text-fg-subtle' },
  rest: { label: 'Descanso', className: 'text-fg-subtle' },
  scheduled: { label: '', className: 'text-fg-muted' }, // muestra la hora
  missing: { label: 'SIN ENTRADA', className: 'text-red-600 dark:text-red-400 font-semibold' },
  on_shift: { label: 'EN TURNO', className: 'text-indigo-600 dark:text-indigo-300 font-semibold' },
  late: { label: 'RETARDO', className: 'text-amber-600 dark:text-amber-400 font-semibold' },
  done: { label: 'TERMINÓ', className: 'text-fg-muted' },
  absent: { label: 'FALTA', className: 'text-red-600 dark:text-red-400 font-semibold' },
  excused: { label: 'JUSTIFICADA', className: 'text-sky-600 dark:text-sky-400' },
}

function DocumentsCell({ docs }: { docs: StaffWithInsights['documents'] }) {
  if (!docs) return <span className="text-xs text-fg-subtle">Sin registrar</span>
  if (docs.status === 'expired')
    return <span className="text-xs font-medium text-red-600 dark:text-red-400">✕ Vencido</span>
  if (docs.status === 'expiring')
    return (
      <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
        ! Vence en {docs.daysToExpiry} días
      </span>
    )
  return <span className="text-xs text-emerald-600 dark:text-emerald-400">✓ Vigentes</span>
}

function StaffListPage() {
  const navigate = useNavigate()
  const canEdit = useCanEditStaff()

  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<StaffRole | ''>('')
  const [status, setStatus] = useState<StaffStatus | ''>('')

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['staff', { page, search, role, status, insights: true }],
    queryFn: async () =>
      (
        await api.get<Paginated<StaffWithInsights>>('/staff', {
          params: {
            page,
            limit: 20,
            search: search || undefined,
            role: role || undefined,
            status: status || undefined,
            insights: true,
          },
        })
      ).data,
    placeholderData: keepPreviousData,
  })
  const stats = useQuery({
    queryKey: ['staff', 'stats'],
    queryFn: async () => (await api.get<StaffStats>('/staff/stats')).data,
  })
  const s = stats.data

  const filtered = !!(search || role || status)

  const columns: Column<StaffWithInsights>[] = [
    {
      header: 'Empleado',
      cell: (r) => (
        <div className="flex items-center gap-3">
          <Avatar name={staffFullName(r)} size="sm" />
          <div className="min-w-0">
            <div className="truncate font-medium text-fg">{staffFullName(r)}</div>
            <div className="font-data text-xs text-fg-muted">{r.employeeNumber}</div>
          </div>
        </div>
      ),
    },
    { header: 'Puesto', cell: (r) => <span className="text-fg-muted">{STAFF_ROLE_LABELS[r.role]}</span> },
    { header: 'Estado', cell: (r) => <StaffStatusBadge status={r.status} /> },
    { header: 'Documentos', cell: (r) => <DocumentsCell docs={r.documents} /> },
    {
      header: 'Hoy',
      cell: (r) => {
        const t = TODAY[r.today.state]
        return (
          <span className={cn('font-data text-xs', t.className)}>
            {r.today.state === 'scheduled' ? `${formatTime(r.today.startAt)}–${formatTime(r.today.endAt)}` : t.label}
          </span>
        )
      },
    },
    {
      header: 'Acceso',
      cell: (r) =>
        r.user ? (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 text-xs',
              r.user.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-fg-subtle',
            )}
          >
            <KeyRound className="size-3.5" />
            {r.user.isActive ? 'Activo' : 'Desactivado'}
          </span>
        ) : (
          <span className="text-xs text-fg-subtle">Sin acceso</span>
        ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Empleados"
        description="Expedientes del personal de la central"
        actions={
          canEdit && (
            <Button variant="accent" icon={Plus} onClick={() => navigate('/personal/nuevo')}>
              Nuevo empleado
            </Button>
          )
        }
        stats={
          <>
            <HeroStat
              label="Activos"
              value={s?.active ?? 0}
              loading={stats.isLoading}
              hint={s && `${s.suspended} suspendido(s)`}
            />
            <HeroStat
              label="Vacaciones / incapacidad"
              value={s?.away ?? 0}
              tone="info"
              loading={stats.isLoading}
              hint="fuera temporalmente"
            />
            <HeroStat
              label="Con documentos vencidos"
              value={s?.withExpiredDocs ?? 0}
              tone={s?.withExpiredDocs ? 'danger' : s?.withExpiringDocs ? 'warning' : 'neutral'}
              loading={stats.isLoading}
              hint={s && `${s.withExpiringDocs} por vencer en ${s.alertDays} días`}
            />
            <HeroStat
              label="Sin acceso al sistema"
              value={s?.withoutAccess ?? 0}
              loading={stats.isLoading}
              hint="no pueden hacer autoregistro"
            />
          </>
        }
      />

      <FilterBar>
        <div className="min-w-60 flex-1">
          <Input
            icon={Search}
            placeholder="Buscar por nombre, número, CURP o teléfono…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-48">
          <Select
            value={role}
            onChange={(e) => {
              setRole(e.target.value as StaffRole | '')
              setPage(1)
            }}
          >
            <option value="">Todos los puestos</option>
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {STAFF_ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-44">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as StaffStatus | '')
              setPage(1)
            }}
          >
            <option value="">Todos los estados</option>
            {STAFF_STATUSES.map((st) => (
              <option key={st} value={st}>
                {STAFF_STATUS_LABELS[st]}
              </option>
            ))}
          </Select>
        </div>
      </FilterBar>

      <Table
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(r) => r.id}
        loading={isLoading}
        refreshing={isFetching && !isLoading}
        onRowClick={(r) => navigate(`/personal/${r.id}`)}
        emptyIcon={Users}
        emptyMessage={filtered ? 'Ningún empleado coincide con los filtros' : 'Aún no hay empleados'}
        emptyDescription={
          filtered ? 'Prueba con otro nombre o quita los filtros.' : 'Registra al primer empleado para empezar.'
        }
        emptyAction={
          !filtered &&
          canEdit && (
            <Button icon={Plus} onClick={() => navigate('/personal/nuevo')}>
              Nuevo empleado
            </Button>
          )
        }
      />
      {data && <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />}
    </div>
  )
}

export default StaffListPage
