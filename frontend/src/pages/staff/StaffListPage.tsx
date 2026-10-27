import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
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
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Field'
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

  const columns: Column<Staff>[] = [
    { header: 'No.', cell: (s) => <span className="font-mono text-xs">{s.employeeNumber}</span> },
    {
      header: 'Nombre',
      cell: (s) => (
        <Link to={`/personal/${s.id}`} className="font-medium text-blue-700 hover:underline">
          {staffFullName(s)}
        </Link>
      ),
    },
    { header: 'Puesto', cell: (s) => STAFF_ROLE_LABELS[s.role] },
    { header: 'Estado', cell: (s) => <StaffStatusBadge status={s.status} /> },
    { header: 'Teléfono', cell: (s) => formatPhone(s.phone) },
    {
      header: 'Acceso',
      cell: (s) =>
        s.user ? (
          <span className={s.user.isActive ? 'text-green-700' : 'text-slate-400'}>
            {s.user.isActive ? 'Sí' : 'Desactivado'}
          </span>
        ) : (
          <span className="text-slate-400">No</span>
        ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Personal</h1>
        {canEdit && <Button onClick={() => navigate('/personal/nuevo')}>Nuevo empleado</Button>}
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_200px_180px]">
        <Input
          placeholder="Buscar por nombre, número, CURP o teléfono…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
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

      <Table columns={columns} rows={data?.data ?? []} rowKey={(s) => s.id} loading={isLoading} />
      {data && <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />}
    </div>
  )
}

export default StaffListPage
