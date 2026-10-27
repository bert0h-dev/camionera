import { useAuth } from '../auth/useAuth'
import { ROLE_LABELS } from '../lib/types'

function HomePage() {
  const { user } = useAuth()

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold text-slate-800">Bienvenido, {user?.fullName}</h1>
      <p className="text-slate-600">
        Rol: <span className="font-medium">{user && ROLE_LABELS[user.role]}</span>
      </p>
    </div>
  )
}

export default HomePage
