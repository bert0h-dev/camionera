import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { useAuth } from '../../auth/useAuth'
import { api, apiErrorMessage } from '../../lib/api'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { AuthShell, FormError } from './AuthShell'
import { NewPasswordFields } from './NewPasswordFields'
import { passwordChecks } from './passwordRules'

/** Cambio obligatorio: contraseña temporal asignada por el admin o "forzar cambio". */
function ForceChangePasswordPage() {
  const { user, refreshUser, logout } = useAuth()
  const navigate = useNavigate()
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const change = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword: current, newPassword: password }),
    onSuccess: async () => {
      await refreshUser()
      navigate('/', { replace: true })
    },
  })

  if (user && !user.mustChangePassword) return <Navigate to="/" replace />
  const valid = current.length > 0 && passwordChecks(password, confirm).every((c) => c.ok)

  return (
    <AuthShell
      title="Actualiza tu contraseña"
      description={
        <>
          Hola <strong className="text-fg">{user?.fullName}</strong>. Por seguridad necesitas definir una contraseña
          nueva antes de continuar.
        </>
      }
    >
      <form
        className="space-y-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          change.mutate()
        }}
      >
        {change.isError && <FormError>{apiErrorMessage(change.error)}</FormError>}
        <Input
          label="Contraseña actual o temporal"
          type="password"
          icon={Lock}
          autoComplete="current-password"
          autoFocus
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <NewPasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
        <Button type="submit" loading={change.isPending} disabled={!valid} className="h-10 w-full">
          Guardar y continuar
        </Button>
      </form>
      <button type="button" onClick={() => void logout()} className="mt-8 text-sm text-fg-muted hover:text-fg">
        Cerrar sesión
      </button>
    </AuthShell>
  )
}

export default ForceChangePasswordPage
