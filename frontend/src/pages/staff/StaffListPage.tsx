import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { KeyRound, Phone, Plus, Search, Users } from 'lucide-react'
import { api } from '../../lib/api'
import { formatPhone, staffFullName } from '../../lib/format'
import {
  STAFF_ROLE_LABELS,
  STAFF_ROLES,
  STAFF_STATUS_LABELS,
  STAFF_STATUSES,
  type Paginated,
  type Staff,
  type StaffRole,
  type StaffStatus,
} from '../../lib/types'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Field'
import { FilterBar } from '../../components/ui/FilterBar'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination, Table, type Column } from '../../components/ui/Table'
import { StaffStatusBadge } from './StaffStatusBadge'
import { useCanEditStaff } from './useCanEditStaff'

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

  const { data, isLoading } = useQuery({
    queryKey: ['staff', { page, search, role, status }],
    queryFn: async () =>
      (
        await api.get<Paginated<Staff>>('/staff', {
          params: {
            page,
            limit: 20,
            search: search || undefined,
            role: role || undefined,
            status: status || undefined,
          },
        })
      ).data,
    placeholderData: keepPreviousData,
  })

  const filtered = !!(search || role || status)

  const columns: Column<Staff>[] = [
    {
      header: 'Empleado',
      cell: (s) => (
        <div className="flex items-center gap-3">
          <Avatar name={staffFullName(s)} size="sm" />
          <div className="min-w-0">
            <div className="truncate font-medium text-fg">{staffFullName(s)}</div>
            <div className="font-mono text-xs text-fg-muted">{s.employeeNumber}</div>
          </div>
        </div>
      ),
    },
    { header: 'Puesto', cell: (s) => <span className="text-fg-muted">{STAFF_ROLE_LABELS[s.role]}</span> },
    { header: 'Estado', cell: (s) => <StaffStatusBadge status={s.status} /> },
    {
      header: 'Teléfono',
      cell: (s) => (
        <span className="tabular inline-flex items-center gap-1.5 text-fg-muted">
          <Phone className="size-3.5 text-fg-subtle" />
          {formatPhone(s.phone)}
        </span>
      ),
    },
    {
      header: 'Acceso',
      cell: (s) =>
        s.user ? (
          <span
            className={
              s.user.isActive
                ? 'inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400'
                : 'inline-flex items-center gap-1.5 text-fg-subtle'
            }
          >
            <KeyRound className="size-3.5" />
            {s.user.isActive ? 'Activo' : 'Desactivado'}
          </span>
        ) : (
          <span className="text-fg-subtle">Sin acceso</span>
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
            {STAFF_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STAFF_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
      </FilterBar>

      <Table
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(s) => s.id}
        loading={isLoading}
        onRowClick={(s) => navigate(`/personal/${s.id}`)}
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
