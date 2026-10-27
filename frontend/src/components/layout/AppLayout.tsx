import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { ROLE_LABELS, type UserRole } from '../../lib/types'

interface NavItem {
  to: string
  label: string
  roles?: UserRole[] // sin roles = visible para todos; admin siempre ve todo
}

const NAV: NavItem[] = [
  { to: '/', label: 'Inicio' },
  { to: '/personal', label: 'Personal', roles: ['hr', 'supervisor', 'coordinator'] },
  { to: '/turnos', label: 'Turnos', roles: ['hr', 'supervisor', 'coordinator'] },
  { to: '/asistencias', label: 'Asistencias', roles: ['hr', 'supervisor', 'coordinator'] },
  { to: '/evaluaciones', label: 'Evaluaciones', roles: ['hr', 'supervisor', 'coordinator'] },
  { to: '/usuarios', label: 'Usuarios', roles: ['admin'] },
]

export function AppLayout() {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  const items = NAV.filter((i) => !i.roles || user?.role === 'admin' || (user && i.roles.includes(user.role)))

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <aside
        className={`${menuOpen ? 'block' : 'hidden'} w-full shrink-0 bg-slate-900 text-slate-100 md:block md:min-h-screen md:w-60`}
      >
        <div className="hidden px-5 py-5 text-lg font-bold md:block">Central Camionera</div>
        <nav className="space-y-1 px-3 pb-4 md:pb-0">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm ${isActive ? 'bg-slate-700 font-semibold text-white' : 'text-slate-300 hover:bg-slate-800'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100 md:hidden"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Menú"
            >
              ☰
            </button>
            <span className="font-semibold text-slate-800 md:hidden">Central Camionera</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-right">
              <div className="font-medium text-slate-800">{user?.fullName}</div>
              <div className="text-xs text-slate-500">{user && ROLE_LABELS[user.role]}</div>
            </div>
            <button type="button" onClick={logout} className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100">
              Salir
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
