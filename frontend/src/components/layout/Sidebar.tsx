import { NavLink } from 'react-router-dom'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useAuth } from '../../auth/useAuth'
import { cn } from '../../lib/cn'
import { Logo } from './Logo'
import { visibleNav } from './nav'

interface SidebarProps {
  collapsed: boolean
  onToggleCollapsed?: () => void
  onNavigate?: () => void
}

/** Barra lateral oscura (índigo) en ambos temas, como en la mayoría de los ERP. */
export function Sidebar({ collapsed, onToggleCollapsed, onNavigate }: SidebarProps) {
  const { user } = useAuth()
  const groups = visibleNav(user?.role)

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-indigo-950 to-[#13123a] text-indigo-100">
      <div
        className={cn('flex h-16 shrink-0 items-center border-b border-white/5', collapsed ? 'justify-center' : 'px-5')}
      >
        <Logo collapsed={collapsed} />
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="Principal">
        {groups.map((g, gi) => (
          <div key={g.label ?? gi}>
            {g.label &&
              (collapsed ? (
                <div className="mx-auto mb-2 h-px w-6 bg-white/10" />
              ) : (
                <div className="mb-2 px-3 text-[11px] font-semibold tracking-wider text-indigo-300/60 uppercase">
                  {g.label}
                </div>
              ))}
            <ul className="space-y-1">
              {g.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        collapsed && 'justify-center px-0',
                        isActive ? 'bg-white/10 text-white' : 'text-indigo-200/80 hover:bg-white/5 hover:text-white',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span className="absolute top-1.5 bottom-1.5 left-0 w-1 rounded-r-full bg-amber-400" />
                        )}
                        <item.icon
                          className={cn('size-[18px] shrink-0', isActive ? 'text-amber-400' : 'text-indigo-300/70')}
                        />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {onToggleCollapsed && (
        <div className="border-t border-white/5 p-3">
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-indigo-300/70 transition-colors hover:bg-white/5 hover:text-white',
              collapsed && 'justify-center px-0',
            )}
            aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {collapsed ? <ChevronsRight className="size-[18px]" /> : <ChevronsLeft className="size-[18px]" />}
            {!collapsed && <span>Colapsar</span>}
          </button>
        </div>
      )}
    </div>
  )
}
