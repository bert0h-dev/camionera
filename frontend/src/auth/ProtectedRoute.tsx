import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { UserRole } from '../lib/types'
import { AppSplash } from '../components/layout/AppSplash'
import { useAuth } from './useAuth'

/** Exige sesión; si se indican roles, también exige uno de ellos (admin siempre pasa). */
export function ProtectedRoute({ roles }: { roles?: UserRole[] }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <AppSplash />
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  if (roles && user.role !== 'admin' && !roles.includes(user.role)) {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}
