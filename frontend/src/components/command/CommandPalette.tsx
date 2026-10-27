import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  CornerDownLeft,
  History,
  Moon,
  Plus,
  Search,
  ShieldCheck,
  Sun,
  UserCog,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../../auth/useAuth'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { staffFullName } from '../../lib/format'
import { preloadPath } from '../../lib/pages'
import { useTheme } from '../../lib/theme'
import { ROLE_LABELS, STAFF_ROLE_LABELS, type Paginated, type Staff, type User } from '../../lib/types'
import { visibleNav } from '../layout/nav'
import { Avatar } from '../ui/Avatar'
import { Spinner } from '../ui/Spinner'
import { onOpenCommandPalette, pushRecent, readRecent, type RecentItem } from './commandEvents'
import { normalize } from './normalize'

interface Command {
  id: string
  section: string
  label: string
  hint?: string
  icon?: LucideIcon
  avatar?: string
  /** Texto extra para que la búsqueda lo encuentre */
  keywords?: string
  to?: string
  recent?: RecentItem
  run?: () => void
}

const SEARCH_DELAY_MS = 250

/** Buscador global (Ctrl+K): pantallas, acciones rápidas, empleados, usuarios y recientes. */
export function CommandPalette() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    const off = onOpenCommandPalette(() => setOpen(true))
    return () => {
      window.removeEventListener('keydown', onKey)
      off()
    }
  }, [])

  if (!open) return null
  return createPortal(<Palette onClose={() => setOpen(false)} />, document.body)
}

function Palette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { setPreference, resolved } = useTheme()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const role = user?.role
  const canStaff = !!role && ['admin', 'hr', 'supervisor', 'coordinator'].includes(role)
  const isAdmin = role === 'admin'
  const isHr = role === 'admin' || role === 'hr'

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), SEARCH_DELAY_MS)
    return () => clearTimeout(t)
  }, [query])

  // Evita que la página de fondo haga scroll mientras el buscador está abierto
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const searching = debounced.length >= 2
  const staff = useQuery({
    queryKey: ['command', 'staff', debounced],
    enabled: canStaff && searching,
    queryFn: async () =>
      (await api.get<Paginated<Staff>>('/staff', { params: { search: debounced, limit: 6 } })).data.data,
  })
  const users = useQuery({
    queryKey: ['command', 'users', debounced],
    enabled: isAdmin && searching,
    queryFn: async () =>
      (await api.get<Paginated<User>>('/users', { params: { search: debounced, limit: 4 } })).data.data,
  })

  const commands = useMemo<Command[]>(() => {
    const q = normalize(query.trim())
    const matches = (c: Command) => !q || normalize(`${c.label} ${c.keywords ?? ''} ${c.hint ?? ''}`).includes(q)

    const pages: Command[] = visibleNav(role).flatMap((g) =>
      g.items.map((i) => ({
        id: `page:${i.to}`,
        section: 'Ir a',
        label: i.label,
        hint: g.label,
        icon: i.icon,
        to: i.to,
        recent: { to: i.to, label: i.label, hint: g.label, kind: 'page' as const },
      })),
    )

    const actions: Command[] = [
      ...(isHr
        ? [
            {
              id: 'action:new-staff',
              section: 'Acciones rápidas',
              label: 'Nuevo empleado',
              icon: Plus,
              keywords: 'alta registrar personal',
              to: '/personal/nuevo',
            },
            {
              id: 'action:new-period',
              section: 'Acciones rápidas',
              label: 'Nuevo periodo de nómina',
              icon: Wallet,
              keywords: 'prenomina semana quincena',
              to: '/nomina?nuevo=1',
            },
          ]
        : []),
      ...(role === 'admin' || role === 'coordinator'
        ? [
            {
              id: 'action:new-bus-model',
              section: 'Acciones rápidas',
              label: 'Nuevo modelo de autobús',
              icon: Plus,
              keywords: 'flota distribucion asientos layout',
              to: '/flota/modelos/nuevo',
            },
          ]
        : []),
      {
        id: 'action:account',
        section: 'Acciones rápidas',
        label: 'Mi cuenta',
        hint: 'contraseña y sesiones',
        icon: UserCog,
        keywords: 'perfil contrasena sesiones',
        to: '/mi-cuenta',
      },
      {
        id: 'action:theme',
        section: 'Acciones rápidas',
        label: resolved === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro',
        icon: resolved === 'dark' ? Sun : Moon,
        keywords: 'tema modo oscuro claro apariencia',
        run: () => setPreference(resolved === 'dark' ? 'light' : 'dark'),
      },
    ]

    const found: Command[] = [
      ...(staff.data ?? []).map((s) => ({
        id: `staff:${s.id}`,
        section: 'Empleados',
        label: staffFullName(s),
        hint: `${s.employeeNumber} · ${STAFF_ROLE_LABELS[s.role]}`,
        avatar: staffFullName(s),
        to: `/personal/${s.id}`,
        recent: { to: `/personal/${s.id}`, label: staffFullName(s), hint: s.employeeNumber, kind: 'staff' as const },
      })),
      ...(users.data ?? []).map((u) => ({
        id: `user:${u.id}`,
        section: 'Usuarios',
        label: u.fullName,
        hint: `${u.email} · ${ROLE_LABELS[u.role]}`,
        icon: ShieldCheck,
        to: `/usuarios/${u.id}`,
        recent: { to: `/usuarios/${u.id}`, label: u.fullName, hint: u.email, kind: 'user' as const },
      })),
    ]

    const recents: Command[] = q
      ? []
      : readRecent().map((r) => ({
          id: `recent:${r.to}`,
          section: 'Recientes',
          label: r.label,
          hint: r.hint,
          icon: r.kind === 'staff' ? UserRound : r.kind === 'user' ? ShieldCheck : History,
          to: r.to,
          recent: r,
        }))

    return [...recents, ...pages.filter(matches), ...actions.filter(matches), ...found]
  }, [query, role, isHr, resolved, setPreference, staff.data, users.data])

  // Si cambia la lista, el resaltado vuelve al primer resultado
  const [prevLength, setPrevLength] = useState(commands.length)
  if (prevLength !== commands.length) {
    setPrevLength(commands.length)
    setActive(0)
  }

  const execute = (c: Command) => {
    onClose()
    if (c.recent) pushRecent(c.recent)
    if (c.run) c.run()
    else if (c.to) navigate(c.to)
  }

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
    const c = commands[active]
    if (c?.to) preloadPath(c.to)
  }, [active, commands])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, commands.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && commands[active]) {
      e.preventDefault()
      execute(commands[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  const loading = searching && (staff.isFetching || users.isFetching)
  const sections: { name: string; items: { c: Command; index: number }[] }[] = []
  commands.forEach((c, index) => {
    const last = sections.at(-1)
    if (last?.name === c.section) last.items.push({ c, index })
    else sections.push({ name: c.section, items: [{ c, index }] })
  })

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-overlay p-4 pt-[12vh] backdrop-blur-sm animate-fade-in"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscador"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-pop animate-pop-in"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-5 shrink-0 text-fg-subtle" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={canStaff ? 'Busca una pantalla, acción o empleado…' : 'Busca una pantalla o acción…'}
            className="h-14 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-subtle"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-list"
            aria-activedescendant={commands[active] ? `command-${active}` : undefined}
          />
          {loading && <Spinner size="sm" className="text-primary" />}
          <Kbd>Esc</Kbd>
        </div>

        <div ref={listRef} id="command-list" role="listbox" className="max-h-[55vh] overflow-y-auto p-2">
          {commands.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-fg-muted">
              {searching && loading ? 'Buscando…' : `Sin resultados para "${query.trim()}"`}
            </p>
          ) : (
            sections.map((s) => (
              <div key={s.name} className="mb-1">
                <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-fg-subtle uppercase">
                  {s.name}
                </div>
                {s.items.map(({ c, index }) => (
                  <button
                    key={c.id}
                    id={`command-${index}`}
                    data-index={index}
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    onMouseMove={() => setActive(index)}
                    onClick={() => execute(c)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm',
                      index === active ? 'bg-primary-soft text-primary-soft-fg' : 'text-fg',
                    )}
                  >
                    {c.avatar ? (
                      <Avatar name={c.avatar} size="sm" />
                    ) : (
                      c.icon && (
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-fg-muted">
                          <c.icon className="size-4" />
                        </span>
                      )
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.label}</span>
                      {c.hint && (
                        <span
                          className={cn(
                            'block truncate text-xs text-fg-muted',
                            c.section === 'Empleados' && 'font-data',
                          )}
                        >
                          {c.hint}
                        </span>
                      )}
                    </span>
                    {index === active && <CornerDownLeft className="size-4 shrink-0 opacity-60" />}
                  </button>
                ))}
              </div>
            ))
          )}
          {canStaff && !searching && query.trim().length === 1 && (
            <p className="px-3 py-2 text-xs text-fg-subtle">Escribe al menos 2 letras para buscar empleados.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-border bg-surface-muted px-4 py-2.5 text-xs text-fg-muted">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> moverse
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Enter</Kbd> abrir
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Esc</Kbd> cerrar
          </span>
        </div>
      </div>
    </div>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="font-data inline-flex h-5 min-w-5 items-center justify-center rounded border border-border-strong bg-surface px-1.5 text-[11px] text-fg-muted">
      {children}
    </kbd>
  )
}
