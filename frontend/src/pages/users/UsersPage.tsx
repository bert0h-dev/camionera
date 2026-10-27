import { useEffect, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import { ROLE_LABELS, USER_ROLES, type Paginated, type User, type UserRole } from '../../lib/types'
import { useAuth } from '../../auth/useAuth'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Field'
import { Pagination, Table, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/toast-context'
import { UserFormModal } from './UserFormModal'
import { ResetPasswordModal } from './ResetPasswordModal'

function UsersPage() {
  const { user: me } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<UserRole | ''>('')
  const [formUser, setFormUser] = useState<User | null | undefined>(undefined) // undefined = cerrado
  const [passwordUser, setPasswordUser] = useState<User | null>(null)

  // Búsqueda con retardo para no consultar en cada tecla
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading } = useQuery({
    queryKey: ['users', { page, search, role }],
    queryFn: async () =>
      (
        await api.get<Paginated<User>>('/users', {
          params: { page, limit: 20, search: search || undefined, role: role || undefined },
        })
      ).data,
    placeholderData: keepPreviousData,
  })

  const toggleActive = useMutation({
    mutationFn: (u: User) => api.patch(`/users/${u.id}`, { isActive: !u.isActive }),
    onSuccess: (_res, u) => {
      toast.success(u.isActive ? 'Usuario desactivado' : 'Usuario activado')
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const columns: Column<User>[] = [
    { header: 'Nombre', cell: (u) => <span className="font-medium">{u.fullName}</span> },
    { header: 'Correo', cell: (u) => u.email },
    { header: 'Rol', cell: (u) => ROLE_LABELS[u.role] },
    {
      header: 'Estado',
      cell: (u) => (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}
        >
          {u.isActive ? 'Activo' : 'Inactivo'}
        </span>
      ),
    },
    {
      header: 'Último acceso',
      cell: (u) => (u.lastLogin ? new Date(u.lastLogin).toLocaleString('es-MX') : '—'),
    },
    {
      header: 'Acciones',
      className: 'text-right',
      cell: (u) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" onClick={() => setFormUser(u)}>
            Editar
          </Button>
          <Button variant="ghost" onClick={() => setPasswordUser(u)}>
            Contraseña
          </Button>
          {u.id !== me?.id && (
            <Button variant="ghost" onClick={() => toggleActive.mutate(u)} disabled={toggleActive.isPending}>
              {u.isActive ? 'Desactivar' : 'Activar'}
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Usuarios</h1>
        <Button onClick={() => setFormUser(null)}>Nuevo usuario</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
        <Input placeholder="Buscar por nombre o correo…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        <Select
          value={role}
          onChange={(e) => {
            setRole(e.target.value as UserRole | '')
            setPage(1)
          }}
        >
          <option value="">Todos los roles</option>
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </div>

      <Table columns={columns} rows={data?.data ?? []} rowKey={(u) => u.id} loading={isLoading} />
      {data && <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />}

      <UserFormModal open={formUser !== undefined} user={formUser ?? null} onClose={() => setFormUser(undefined)} />
      <ResetPasswordModal user={passwordUser} onClose={() => setPasswordUser(null)} />
    </div>
  )
}

export default UsersPage
