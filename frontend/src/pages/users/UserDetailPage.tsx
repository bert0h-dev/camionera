import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  IdCard,
  KeyRound,
  LockOpen,
  LogOut,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  ShieldCheck,
  User as UserIcon,
  UserCheck,
  UserX,
} from 'lucide-react'
import { useAuth } from '../../auth/useAuth'
import { api, apiErrorMessage } from '../../lib/api'
import { businessFormat, formatDate, staffFullName } from '../../lib/format'
import { ROLE_LABELS, STAFF_ROLE_LABELS, type UserDetail } from '../../lib/types'
import { Alert } from '../../components/ui/Alert'
import { Avatar } from '../../components/ui/Avatar'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { Dropdown, DropdownItem, DropdownSeparator } from '../../components/ui/Dropdown'
import { EmptyState } from '../../components/ui/EmptyState'
import { HeroStat } from '../../components/ui/HeroStat'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingBlock } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/toast-context'
import { SessionList } from '../account/SessionList'
import { ResetPasswordModal } from './ResetPasswordModal'
import { UserFormModal } from './UserFormModal'

const ACTION_LABELS = { insert: 'creó', update: 'modificó', delete: 'eliminó' } as const
const DATE_TIME = businessFormat({ dateStyle: 'medium', timeStyle: 'short' })

type Confirm = 'force' | 'sessions' | 'toggle' | null

function UserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user: me } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>(null)
  // Instante de referencia para saber si el bloqueo sigue vigente
  const [now] = useState(() => Date.now())

  const {
    data: u,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ['users', id, 'detail'],
    queryFn: async () => (await api.get<UserDetail>(`/users/${id}/detail`)).data,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] })
  const post = (path: string, ok: string) => ({
    mutationFn: () => api.post(`/users/${id}/${path}`),
    onSuccess: () => {
      toast.success(ok)
      setConfirm(null)
      invalidate()
    },
    onError: (err: unknown) => {
      setConfirm(null)
      toast.error(apiErrorMessage(err))
    },
  })
  const force = useMutation(post('force-password-change', 'Deberá cambiar su contraseña al entrar'))
  const revoke = useMutation(post('revoke-sessions', 'Se cerraron todas sus sesiones'))
  const unlock = useMutation(post('unlock', 'Cuenta desbloqueada'))
  const toggle = useMutation({
    mutationFn: () => api.patch(`/users/${id}`, { isActive: !u?.isActive }),
    onSuccess: () => {
      toast.success(u?.isActive ? 'Usuario desactivado' : 'Usuario activado')
      setConfirm(null)
      invalidate()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  if (isLoading) return <LoadingBlock text="Cargando usuario…" />
  if (!u)
    return (
      <Card>
        <EmptyState icon={UserIcon} title="No se encontró el usuario" />
      </Card>
    )

  const isMe = u.id === me?.id
  const locked = !!u.lockedUntil && new Date(u.lockedUntil).getTime() > now

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-4">
            <Avatar name={u.fullName} size="lg" className="size-14 ring-4 ring-amber-400/90" />
            <span className="flex flex-wrap items-center gap-3">
              {u.fullName}
              <Badge tone={u.isActive ? 'success' : 'neutral'} dot>
                {u.isActive ? 'Activo' : 'Inactivo'}
              </Badge>
              {locked && (
                <Badge tone="danger" dot>
                  Bloqueado
                </Badge>
              )}
            </span>
          </span>
        }
        description={
          <>
            <Link to="/usuarios" className="hover:text-white hover:underline">
              Usuarios
            </Link>{' '}
            · {u.email}
          </>
        }
        refreshing={isFetching && !isLoading}
        actions={
          <>
            <Button variant="glass" icon={Pencil} onClick={() => setEditing(true)}>
              Editar
            </Button>
            <Dropdown
              trigger={({ toggle: open }) => (
                <Button variant="glass" icon={MoreHorizontal} onClick={open}>
                  Seguridad
                </Button>
              )}
            >
              {(close) => (
                <>
                  <DropdownItem
                    icon={KeyRound}
                    onClick={() => {
                      close()
                      setResetting(true)
                    }}
                  >
                    Asignar contraseña temporal
                  </DropdownItem>
                  <DropdownItem
                    icon={RotateCcw}
                    onClick={() => {
                      close()
                      setConfirm('force')
                    }}
                  >
                    Forzar cambio de contraseña
                  </DropdownItem>
                  <DropdownItem
                    icon={LogOut}
                    onClick={() => {
                      close()
                      setConfirm('sessions')
                    }}
                  >
                    Cerrar todas sus sesiones
                  </DropdownItem>
                  {!isMe && (
                    <>
                      <DropdownSeparator />
                      <DropdownItem
                        icon={u.isActive ? UserX : UserCheck}
                        danger={u.isActive}
                        onClick={() => {
                          close()
                          setConfirm('toggle')
                        }}
                      >
                        {u.isActive ? 'Desactivar usuario' : 'Activar usuario'}
                      </DropdownItem>
                    </>
                  )}
                </>
              )}
            </Dropdown>
          </>
        }
        stats={
          <>
            <HeroStat label="Rol" value={ROLE_LABELS[u.role]} tone="primary" hint="permisos en el sistema" />
            <HeroStat
              label="Sesiones abiertas"
              value={u.sessions.length}
              hint={u.sessions.length ? 'en uno o más dispositivos' : 'sin sesiones activas'}
            />
            <HeroStat
              label="Último acceso"
              value={u.lastLogin ? formatDate(u.lastLogin) : 'Nunca'}
              hint={u.lastLogin ? DATE_TIME.format(new Date(u.lastLogin)) : 'aún no inicia sesión'}
            />
            <HeroStat
              label="Intentos fallidos"
              value={locked ? 'Bloqueado' : u.failedLoginAttempts}
              tone={locked ? 'danger' : u.failedLoginAttempts ? 'warning' : 'neutral'}
              hint={locked ? `hasta ${DATE_TIME.format(new Date(u.lockedUntil!))}` : 'desde el último acceso'}
            />
          </>
        }
      />

      {locked && (
        <Alert
          tone="danger"
          title="Cuenta bloqueada por intentos fallidos"
          action={
            <Button
              size="sm"
              variant="secondary"
              icon={LockOpen}
              loading={unlock.isPending}
              onClick={() => unlock.mutate()}
            >
              Desbloquear
            </Button>
          }
        >
          Se desbloquea sola a las {DATE_TIME.format(new Date(u.lockedUntil!))} o puedes hacerlo ahora.
        </Alert>
      )}
      {u.mustChangePassword && (
        <Alert tone="warning" title="Cambio de contraseña pendiente">
          Al iniciar sesión se le pedirá definir una contraseña nueva.
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <IdCard className="size-4 text-fg-subtle" /> Empleado ligado
                </span>
              }
            />
            <CardBody>
              {u.staff ? (
                <Link
                  to={`/personal/${u.staff.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-surface-muted"
                >
                  <Avatar name={staffFullName(u.staff)} size="sm" />
                  <span>
                    <span className="block font-medium text-fg">{staffFullName(u.staff)}</span>
                    <span className="font-data block text-xs text-fg-muted">
                      {u.staff.employeeNumber} · {STAFF_ROLE_LABELS[u.staff.role]}
                    </span>
                  </span>
                </Link>
              ) : (
                <p className="text-sm text-fg-muted">
                  Esta cuenta no corresponde a un empleado. Para ligarla, dale acceso desde la ficha del empleado.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Activity className="size-4 text-fg-subtle" /> Actividad reciente
                </span>
              }
              description="Últimos cambios que hizo en el sistema"
            />
            {u.activity.length === 0 ? (
              <p className="px-5 py-6 text-sm text-fg-muted">Sin actividad registrada.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {u.activity.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <span className="text-fg">
                      {ACTION_LABELS[a.actionType]} en <span className="font-data text-xs">{a.tableName}</span>
                    </span>
                    <span className="font-data shrink-0 text-xs text-fg-muted">
                      {DATE_TIME.format(new Date(a.createdAt))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-fg-subtle" /> Sesiones abiertas
              </span>
            }
            actions={
              u.sessions.length > 0 && (
                <Button size="sm" variant="secondary" icon={LogOut} onClick={() => setConfirm('sessions')}>
                  Cerrar todas
                </Button>
              )
            }
          />
          <SessionList sessions={u.sessions} />
        </Card>
      </div>

      <UserFormModal open={editing} user={u} onClose={() => setEditing(false)} />
      <ResetPasswordModal user={resetting ? u : null} onClose={() => setResetting(false)} />
      <ConfirmModal
        open={confirm === 'force'}
        title="Forzar cambio de contraseña"
        message="La próxima vez que inicie sesión deberá definir una contraseña nueva antes de continuar."
        confirmLabel="Forzar cambio"
        loading={force.isPending}
        onConfirm={() => force.mutate()}
        onClose={() => setConfirm(null)}
      />
      <ConfirmModal
        open={confirm === 'sessions'}
        title="Cerrar todas sus sesiones"
        message={
          isMe
            ? 'También se cerrará tu sesión actual y tendrás que volver a entrar.'
            : 'Tendrá que volver a iniciar sesión en todos sus dispositivos.'
        }
        confirmLabel="Cerrar sesiones"
        tone="danger"
        loading={revoke.isPending}
        onConfirm={() => revoke.mutate()}
        onClose={() => setConfirm(null)}
      />
      <ConfirmModal
        open={confirm === 'toggle'}
        title={u.isActive ? 'Desactivar usuario' : 'Activar usuario'}
        message={
          u.isActive
            ? 'Ya no podrá iniciar sesión y se cerrarán sus sesiones abiertas.'
            : 'Podrá volver a iniciar sesión con su contraseña actual.'
        }
        confirmLabel={u.isActive ? 'Desactivar' : 'Activar'}
        tone={u.isActive ? 'danger' : 'primary'}
        loading={toggle.isPending}
        onConfirm={() => toggle.mutate()}
        onClose={() => setConfirm(null)}
      />
    </div>
  )
}

export default UserDetailPage
