import { CalendarClock, ClipboardCheck, LayoutDashboard, ShieldCheck, Star, Users, type LucideIcon } from 'lucide-react'
import type { UserRole } from '../../lib/types'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  roles?: UserRole[] // sin roles = visible para todos; admin siempre ve todo
}

export interface NavGroup {
  label?: string
  items: NavItem[]
}

const STAFF_READERS: UserRole[] = ['hr', 'supervisor', 'coordinator']

// Cada módulo nuevo agrega su grupo aquí
export const NAV: NavGroup[] = [
  { items: [{ to: '/', label: 'Inicio', icon: LayoutDashboard }] },
  {
    label: 'Personal',
    items: [
      { to: '/personal', label: 'Empleados', icon: Users, roles: STAFF_READERS },
      { to: '/turnos', label: 'Turnos', icon: CalendarClock, roles: STAFF_READERS },
      { to: '/asistencias', label: 'Asistencias', icon: ClipboardCheck, roles: STAFF_READERS },
      { to: '/evaluaciones', label: 'Evaluaciones', icon: Star, roles: STAFF_READERS },
    ],
  },
  {
    label: 'Sistema',
    items: [{ to: '/usuarios', label: 'Usuarios', icon: ShieldCheck, roles: ['admin'] }],
  },
]

export function canSee(item: NavItem, role: UserRole | undefined) {
  return !item.roles || role === 'admin' || (!!role && item.roles.includes(role))
}

/** Grupos con solo los elementos visibles para el rol; se omiten los vacíos. */
export function visibleNav(role: UserRole | undefined) {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => canSee(i, role)) })).filter((g) => g.items.length > 0)
}

// Etiquetas de segmentos de URL para la ruta de navegación
const SEGMENT_LABELS: Record<string, string> = {
  personal: 'Empleados',
  turnos: 'Turnos',
  asistencias: 'Asistencias',
  evaluaciones: 'Evaluaciones',
  usuarios: 'Usuarios',
  nuevo: 'Nuevo',
  editar: 'Editar',
}

export interface Crumb {
  label: string
  to: string
}

/** "/personal/abc/editar" → Empleados › Detalle › Editar */
export function breadcrumbs(pathname: string): Crumb[] {
  const parts = pathname.split('/').filter(Boolean)
  return parts.map((p, i) => ({
    label: SEGMENT_LABELS[p] ?? 'Detalle',
    to: '/' + parts.slice(0, i + 1).join('/'),
  }))
}
