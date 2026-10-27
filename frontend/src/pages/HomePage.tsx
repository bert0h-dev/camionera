import { useAuth } from '../auth/useAuth'
import { ROLE_LABELS, type UserRole } from '../lib/types'
import { ExpirationsPanel } from './home/ExpirationsPanel'

const STAFF_READERS: UserRole[] = ['admin', 'hr', 'supervisor', 'coordinator']

function HomePage() {
  const { user } = useAuth()

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-800">Bienvenido, {user?.fullName}</h1>
        <p className="text-slate-600">
          Rol: <span className="font-medium">{user && ROLE_LABELS[user.role]}</span>
        </p>
      </div>
      {user && STAFF_READERS.includes(user.role) && <ExpirationsPanel />}
    </div>
  )
}

export default HomePage
