import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Lock, Mail } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { apiErrorMessage } from '../lib/api'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { AuthShell, FormError } from './auth/AuthShell'

const schema = z.object({
  email: z.email('Correo inválido'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
})
type FormValues = z.infer<typeof schema>

function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/'
  if (user) return <Navigate to={from} replace />

  const onSubmit = async (values: FormValues) => {
    setError(null)
    try {
      await login(values.email, values.password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudo iniciar sesión'))
    }
  }

  return (
    <AuthShell title="Bienvenido de nuevo" description="Ingresa tus credenciales para continuar.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {error && <FormError>{error}</FormError>}
        <Input
          label="Correo electrónico"
          type="email"
          icon={Mail}
          placeholder="nombre@empresa.mx"
          autoComplete="email"
          autoFocus
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Contraseña"
          type="password"
          icon={Lock}
          placeholder="••••••••"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" loading={isSubmitting} className="h-10 w-full">
          Iniciar sesión
        </Button>
      </form>
      <p className="mt-8 text-center text-sm">
        <Link to="/recuperar" className="font-medium text-link hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
      </p>
    </AuthShell>
  )
}

export default LoginPage
