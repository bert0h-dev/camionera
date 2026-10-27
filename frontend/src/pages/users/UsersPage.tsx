import { useEffect, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import { ROLE_LABELS, USER_ROLES, type Paginated, type User, type UserRole } from '../../lib/types'
import { useAuth } from '../../auth/useAuth'
import { KeyRound, MoreHorizontal, Pencil, Plus, Search, ShieldCheck, UserCheck, UserX } from 'lucide-react'
import { Avatar } from '../../components/ui/Avatar'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Dropdown, DropdownItem, DropdownSeparator } from '../../components/ui/Dropdown'
import { Input, Select } from '../../components/ui/Field'
import { FilterBar } from '../../components/ui/FilterBar'
import { PageHeader } from '../../components/ui/PageHeader'
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
    {
      header: 'Usuario',
      cell: (u) => (
        <div className="flex items-center gap-3">
          <Avatar name={u.fullName} size="sm" />
          <div className="min-w-0">
            <div className="truncate font-medium text-fg">
              {u.fullName}
              {u.id === me?.id && <span className="ml-1.5 text-xs font-normal text-fg-muted">(tú)</span>}
            </div>
            <div className="truncate text-xs text-fg-muted">{u.email}</div>
          </div>
        </div>
      ),
    },
    {
      header: 'Rol',
      cell: (u) => <Badge tone={u.role === 'admin' ? 'primary' : 'neutral'}>{ROLE_LABELS[u.role]}</Badge>,
    },
    {
      header: 'Estado',
      cell: (u) => (
        <Badge tone={u.isActive ? 'success' : 'neutral'} dot>
          {u.isActive ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
    {
      header: 'Último acceso',
      cell: (u) => (
        <span className="tabular text-fg-muted">
          {u.lastLogin
            ? new Date(u.lastLogin).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
            : 'Nunca'}
        </span>
      ),
    },
    {
      header: 'Acciones',
      className: 'w-16 text-right',
      cell: (u) => (
        <Dropdown
          trigger={({ toggle }) => (
            <Button variant="ghost" size="icon" icon={MoreHorizontal} onClick={toggle} aria-label="Acciones" />
          )}
        >
          {(close) => (
            <>
              <DropdownItem
                icon={Pencil}
                onClick={() => {
                  close()
                  setFormUser(u)
                }}
              >
                Editar
              </DropdownItem>
              <DropdownItem
                icon={KeyRound}
                onClick={() => {
                  close()
                  setPasswordUser(u)
                }}
              >
                Cambiar contraseña
              </DropdownItem>
              {u.id !== me?.id && (
                <>
                  <DropdownSeparator />
                  <DropdownItem
                    icon={u.isActive ? UserX : UserCheck}
                    danger={u.isActive}
                    onClick={() => {
                      close()
                      toggleActive.mutate(u)
                    }}
                  >
                    {u.isActive ? 'Desactivar' : 'Activar'}
                  </DropdownItem>
                </>
              )}
            </>
          )}
        </Dropdown>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        description="Cuentas con acceso al sistema y sus permisos"
        actions={
          <Button variant="accent" icon={Plus} onClick={() => setFormUser(null)}>
            Nuevo usuario
          </Button>
        }
      />

      <FilterBar>
        <div className="min-w-60 flex-1">
          <Input
            icon={Search}
            placeholder="Buscar por nombre o correo…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-48">
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
      </FilterBar>

      <Table
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(u) => u.id}
        loading={isLoading}
        emptyIcon={ShieldCheck}
        emptyMessage="Ningún usuario coincide con la búsqueda"
      />
      {data && <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />}

      <UserFormModal open={formUser !== undefined} user={formUser ?? null} onClose={() => setFormUser(undefined)} />
      <ResetPasswordModal user={passwordUser} onClose={() => setPasswordUser(null)} />
    </div>
  )
}

export default UsersPage
