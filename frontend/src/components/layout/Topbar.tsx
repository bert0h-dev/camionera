import { Fragment } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, LogOut, Menu, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useAuth } from '../../auth/useAuth'
import { cn } from '../../lib/cn'
import { useTheme, type ThemePreference } from '../../lib/theme'
import { ROLE_LABELS } from '../../lib/types'
import { Avatar } from '../ui/Avatar'
import { Dropdown, DropdownItem, DropdownSeparator } from '../ui/Dropdown'
import { breadcrumbs } from './nav'
import { TopProgress } from './TopProgress'

const THEMES: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
]

const ICON_BUTTON =
  'flex size-9 items-center justify-center rounded-lg text-indigo-200 transition-colors hover:bg-white/10 hover:text-white'

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { pathname } = useLocation()
  const crumbs = breadcrumbs(pathname)

  return (
    <header className="bg-band sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 px-4 text-white md:px-8">
      <button type="button" className={cn(ICON_BUTTON, 'md:hidden')} onClick={onOpenMenu} aria-label="Abrir menú">
        <Menu className="size-5" />
      </button>

      <nav aria-label="Ruta" className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
        <Link to="/" className="shrink-0 text-indigo-200 transition-colors hover:text-white">
          Inicio
        </Link>
        {crumbs.map((c, i) => (
          <Fragment key={c.to}>
            <ChevronRight className="size-4 shrink-0 text-indigo-400" />
            {i === crumbs.length - 1 ? (
              <span className="truncate font-medium text-white" aria-current="page">
                {c.label}
              </span>
            ) : (
              <Link to={c.to} className="truncate text-indigo-200 transition-colors hover:text-white">
                {c.label}
              </Link>
            )}
          </Fragment>
        ))}
      </nav>

      <ThemeMenu />
      <UserMenu />
      <TopProgress />
    </header>
  )
}

function ThemeMenu() {
  const { preference, resolved, setPreference } = useTheme()
  const Current = resolved === 'dark' ? Moon : Sun
  return (
    <Dropdown
      className="min-w-40"
      trigger={({ toggle }) => (
        <button type="button" className={ICON_BUTTON} onClick={toggle} aria-label="Cambiar tema">
          <Current className="size-5" />
        </button>
      )}
    >
      {(close) =>
        THEMES.map((t) => (
          <DropdownItem
            key={t.value}
            icon={t.icon}
            active={preference === t.value}
            onClick={() => {
              setPreference(t.value)
              close()
            }}
          >
            {t.label}
          </DropdownItem>
        ))
      }
    </Dropdown>
  )
}

function UserMenu() {
  const { user, logout } = useAuth()
  if (!user) return null
  return (
    <Dropdown
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-3 rounded-lg py-1 pr-2 pl-1 transition-colors hover:bg-white/10"
          aria-label="Menú de usuario"
        >
          <Avatar name={user.fullName} size="sm" />
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-sm font-medium text-white">{user.fullName}</span>
            <span className="block text-xs text-indigo-300">{ROLE_LABELS[user.role]}</span>
          </span>
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="px-2.5 py-2">
            <div className="truncate text-sm font-medium text-fg">{user.fullName}</div>
            <div className="truncate text-xs text-fg-muted">{user.email}</div>
          </div>
          <DropdownSeparator />
          <DropdownItem
            icon={LogOut}
            danger
            onClick={() => {
              close()
              void logout()
            }}
          >
            Cerrar sesión
          </DropdownItem>
        </>
      )}
    </Dropdown>
  )
}
