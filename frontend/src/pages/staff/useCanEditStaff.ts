import { useAuth } from '../../auth/useAuth'

/** Solo admin y RRHH modifican personal; supervisor y coordinador solo consultan. */
export function useCanEditStaff() {
  const { user } = useAuth()
  return user?.role === 'admin' || user?.role === 'hr'
}
