import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { UserRole } from '../lib/types'
import { useAuth } from './useAuth'

/** Exige sesión; si se indican roles, también exige uno de ellos (admin siempre pasa). */
export function ProtectedRoute({ roles }: { roles?: UserRole[] }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Cargando…</div>
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  if (roles && user.role !== 'admin' && !roles.includes(user.role)) {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}
