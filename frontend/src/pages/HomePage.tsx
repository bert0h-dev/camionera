import { useAuth } from '../auth/useAuth'
import { ROLE_LABELS, type UserRole } from '../lib/types'
import { ExpirationsPanel } from './home/ExpirationsPanel'
import { MyShiftCard } from './home/MyShiftCard'
import { MyEvaluationsCard } from './home/MyEvaluationsCard'

const STAFF_READERS: UserRole[] = ['admin', 'hr', 'supervisor', 'coordinator']

function HomePage() {
  const { user } = useAuth()

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-fg">Bienvenido, {user?.fullName}</h1>
        <p className="text-fg-muted">
          Rol: <span className="font-medium">{user && ROLE_LABELS[user.role]}</span>
        </p>
      </div>
      <MyShiftCard />
      <MyEvaluationsCard />
      {user && STAFF_READERS.includes(user.role) && <ExpirationsPanel />}
    </div>
  )
}

export default HomePage
