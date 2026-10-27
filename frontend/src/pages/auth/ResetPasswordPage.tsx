import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { Button } from '../../components/ui/Button'
import { AuthShell, FormError } from './AuthShell'
import { NewPasswordFields } from './NewPasswordFields'
import { passwordChecks } from './passwordRules'

/** Destino del enlace del correo: /restablecer?token=… */
function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const reset = useMutation({ mutationFn: () => api.post('/auth/reset-password', { token, newPassword: password }) })
  const valid = passwordChecks(password, confirm).every((c) => c.ok)

  if (reset.isSuccess)
    return (
      <AuthShell title="Contraseña actualizada" description="Ya puedes entrar con tu nueva contraseña.">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 text-sm text-fg-muted shadow-card">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-500" />
          Por seguridad cerramos las sesiones que tenías abiertas en otros equipos.
        </div>
        <Link to="/login" className="mt-6 block">
          <Button className="h-10 w-full">Iniciar sesión</Button>
        </Link>
      </AuthShell>
    )

  if (!token)
    return (
      <AuthShell title="Enlace incompleto" description="Abre el enlace completo que te llegó por correo.">
        <Link
          to="/recuperar"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-link hover:underline"
        >
          <ArrowLeft className="size-4" /> Solicitar un enlace nuevo
        </Link>
      </AuthShell>
    )

  return (
    <AuthShell title="Crea tu nueva contraseña" description="Elige una contraseña que no uses en otros sitios.">
      <form
        className="space-y-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          reset.mutate()
        }}
      >
        {reset.isError && (
          <FormError>
            {apiErrorMessage(reset.error)}{' '}
            <Link to="/recuperar" className="font-semibold underline">
              Solicitar uno nuevo
            </Link>
          </FormError>
        )}
        <NewPasswordFields
          password={password}
          confirm={confirm}
          onPassword={setPassword}
          onConfirm={setConfirm}
          autoFocus
        />
        <Button type="submit" loading={reset.isPending} disabled={!valid} className="h-10 w-full">
          Guardar contraseña
        </Button>
      </form>
    </AuthShell>
  )
}

export default ResetPasswordPage
