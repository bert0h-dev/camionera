import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, CalendarClock, ClipboardCheck, Lock, Mail, ShieldCheck } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { apiErrorMessage } from '../lib/api'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { Logo } from '../components/layout/Logo'

const schema = z.object({
  email: z.email('Correo inválido'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
})
type FormValues = z.infer<typeof schema>

const YEAR = new Date().getFullYear()

const HIGHLIGHTS = [
  { icon: CalendarClock, text: 'Turnos validados con NOM-087 y LFT' },
  { icon: ClipboardCheck, text: 'Asistencias con autoregistro y cierre diario' },
  { icon: ShieldCheck, text: 'Accesos por rol y bitácora de cambios' },
]

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
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Panel de marca */}
      <section className="relative hidden overflow-hidden bg-indigo-950 p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -left-32 size-[28rem] rounded-full bg-indigo-600/40 blur-3xl" />
          <div className="absolute -right-24 -bottom-40 size-[30rem] rounded-full bg-amber-500/20 blur-3xl" />
          {/* Carriles de carretera */}
          <svg className="absolute inset-0 size-full opacity-[0.07]" aria-hidden>
            <defs>
              <pattern id="road" width="80" height="80" patternUnits="userSpaceOnUse" patternTransform="rotate(-20)">
                <rect width="40" height="4" y="38" fill="white" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#road)" />
          </svg>
        </div>

        <Logo className="relative" />

        <div className="relative my-auto max-w-lg">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-surface/10 px-3 py-1 text-xs font-medium text-amber-300 ring-1 ring-white/10">
            <span className="size-1.5 rounded-full bg-amber-400" />
            Operación en tiempo real
          </p>
          <h1 className="text-4xl leading-tight font-semibold tracking-tight">
            Toda la operación de tu central,{' '}
            <span className="bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">
              en un solo lugar.
            </span>
          </h1>
          <p className="mt-4 text-lg text-indigo-200/80">
            Personal, rutas, flota y boletos conectados para que cada salida llegue a tiempo.
          </p>
          <ul className="mt-10 space-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-indigo-100">
                <span className="flex size-9 items-center justify-center rounded-lg bg-surface/10 ring-1 ring-white/10">
                  <Icon className="size-[18px] text-amber-300" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-indigo-300/60">© {YEAR} Central Camionera</p>
      </section>

      {/* Formulario */}
      <section className="flex items-center justify-center bg-app p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <div className="inline-flex rounded-2xl bg-indigo-950 p-3 pr-5">
              <Logo />
            </div>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-fg">Bienvenido de nuevo</h2>
          <p className="mt-1.5 text-sm text-fg-muted">Ingresa tus credenciales para continuar.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                {error}
              </div>
            )}
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

          <p className="mt-8 text-center text-xs text-fg-subtle">
            ¿Olvidaste tu contraseña? Contacta al administrador del sistema.
          </p>
        </div>
      </section>
    </main>
  )
}

export default LoginPage
