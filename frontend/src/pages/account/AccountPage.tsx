import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Lock, LogOut, ShieldCheck, User as UserIcon } from 'lucide-react'
import { useAuth } from '../../auth/useAuth'
import { api, apiErrorMessage } from '../../lib/api'
import { businessFormat, formatDate } from '../../lib/format'
import { ROLE_LABELS, type UserSession } from '../../lib/types'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Input } from '../../components/ui/Field'
import { HeroStat } from '../../components/ui/HeroStat'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingBlock } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/toast-context'
import { NewPasswordFields } from '../auth/NewPasswordFields'
import { passwordChecks } from '../auth/passwordRules'
import { SessionList } from './SessionList'

const DATE_TIME = businessFormat({ dateStyle: 'long', timeStyle: 'short' })

function AccountPage() {
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()

  const sessions = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: async () => (await api.get<UserSession[]>('/auth/sessions')).data,
  })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] })

  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => {
      toast.success('Sesión cerrada')
      invalidate()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })
  const revokeOthers = useMutation({
    mutationFn: () => api.post('/auth/sessions/revoke-others'),
    onSuccess: () => {
      toast.success('Se cerraron las demás sesiones')
      invalidate()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  if (!user) return null
  const list = sessions.data ?? []
  const others = list.filter((s) => !s.current).length

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-4">
            <Avatar name={user.fullName} size="lg" className="size-14 ring-4 ring-amber-400/90" />
            {user.fullName}
          </span>
        }
        description={`${user.email} · ${ROLE_LABELS[user.role]}`}
        stats={
          <>
            <HeroStat
              label="Rol en el sistema"
              value={ROLE_LABELS[user.role]}
              hint="define lo que puedes ver y hacer"
            />
            <HeroStat
              label="Sesiones abiertas"
              value={list.length}
              loading={sessions.isLoading}
              tone={others > 2 ? 'warning' : 'neutral'}
              hint={others ? `${others} en otros dispositivos` : 'solo este dispositivo'}
            />
            <HeroStat
              label="Último acceso"
              value={user.lastLogin ? formatDate(user.lastLogin) : '—'}
              hint={user.lastLogin ? DATE_TIME.format(new Date(user.lastLogin)) : 'primer acceso'}
            />
            <HeroStat label="Cuenta creada" value={formatDate(user.createdAt)} hint="fecha de alta" />
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <UserIcon className="size-4 text-fg-subtle" /> Mis datos
                </span>
              }
            />
            <CardBody>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-fg-muted">Nombre</dt>
                  <dd className="mt-1 text-fg">{user.fullName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-muted">Correo</dt>
                  <dd className="mt-1 text-fg">{user.email}</dd>
                </div>
              </dl>
              <p className="mt-4 text-xs text-fg-muted">
                Para cambiar tu nombre o correo pide ayuda a un administrador.
              </p>
            </CardBody>
          </Card>
          <ChangePasswordCard />
        </div>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-fg-subtle" /> Sesiones abiertas
              </span>
            }
            description="Dispositivos donde tu cuenta está iniciada. Si no reconoces alguno, ciérralo y cambia tu contraseña."
            actions={
              others > 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={LogOut}
                  loading={revokeOthers.isPending}
                  onClick={() => revokeOthers.mutate()}
                >
                  Cerrar las demás
                </Button>
              )
            }
          />
          {sessions.isLoading ? (
            <LoadingBlock />
          ) : (
            <SessionList
              sessions={list}
              onRevoke={(id) => revoke.mutate(id)}
              revokingId={revoke.isPending ? revoke.variables : undefined}
            />
          )}
        </Card>
      </div>

      <p className="text-center text-xs text-fg-subtle">
        ¿Olvidaste tu contraseña en otro equipo?{' '}
        <Link to="/recuperar" className="text-link hover:underline">
          Recupérala por correo
        </Link>
      </p>
    </div>
  )
}

function ChangePasswordCard() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const change = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword: current, newPassword: password }),
    onSuccess: () => {
      toast.success('Contraseña actualizada; se cerraron tus otras sesiones')
      setCurrent('')
      setPassword('')
      setConfirm('')
      queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] })
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })
  const valid = current.length > 0 && passwordChecks(password, confirm).every((c) => c.ok)

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <KeyRound className="size-4 text-fg-subtle" /> Cambiar contraseña
          </span>
        }
        description="Al cambiarla se cierran tus sesiones en otros dispositivos."
      />
      <CardBody>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            change.mutate()
          }}
        >
          <Input
            label="Contraseña actual"
            type="password"
            icon={Lock}
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <NewPasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
          <div className="flex justify-end">
            <Button type="submit" icon={KeyRound} loading={change.isPending} disabled={!valid}>
              Actualizar contraseña
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}

export default AccountPage
