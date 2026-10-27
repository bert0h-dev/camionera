import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, Mail, MailCheck } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { AuthShell, FormError } from './AuthShell'

function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const send = useMutation({ mutationFn: () => api.post('/auth/forgot-password', { email }) })

  if (send.isSuccess)
    return (
      <AuthShell
        title="Revisa tu correo"
        description={
          <>
            Si <strong className="text-fg">{email}</strong> corresponde a una cuenta activa, te enviamos un enlace para
            crear una nueva contraseña. Vence en 1 hora.
          </>
        }
      >
        <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 text-sm text-fg-muted shadow-card">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-emerald-500" />
          ¿No llegó? Revisa la carpeta de spam o vuelve a intentarlo en unos minutos.
        </div>
        <Link
          to="/login"
          className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-link hover:underline"
        >
          <ArrowLeft className="size-4" /> Volver a iniciar sesión
        </Link>
      </AuthShell>
    )

  return (
    <AuthShell
      title="Recupera tu acceso"
      description="Escribe el correo de tu cuenta y te enviaremos un enlace para crear una nueva contraseña."
    >
      <form
        className="space-y-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          send.mutate()
        }}
      >
        {send.isError && <FormError>{apiErrorMessage(send.error)}</FormError>}
        <Input
          label="Correo electrónico"
          type="email"
          icon={Mail}
          placeholder="nombre@empresa.mx"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" loading={send.isPending} disabled={!/\S+@\S+\.\S+/.test(email)} className="h-10 w-full">
          Enviar enlace
        </Button>
      </form>
      <Link to="/login" className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-link hover:underline">
        <ArrowLeft className="size-4" /> Volver a iniciar sesión
      </Link>
    </AuthShell>
  )
}

export default ForgotPasswordPage
