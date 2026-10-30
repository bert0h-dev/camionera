import {
  Building2,
  Bus,
  LayoutGrid,
  CalendarClock,
  CalendarRange,
  ScrollText,
  Settings,
  ClipboardCheck,
  Fuel,
  LayoutDashboard,
  Route,
  Search,
  ShieldCheck,
  Star,
  Ticket,
  TramFront,
  TriangleAlert,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
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
const FLEET_READERS: UserRole[] = ['coordinator', 'supervisor']
const ROUTE_READERS: UserRole[] = ['coordinator', 'supervisor', 'vendor']
const TRIP_READERS: UserRole[] = ['coordinator', 'supervisor', 'vendor']

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
      { to: '/nomina', label: 'Nómina', icon: Wallet, roles: ['hr'] },
    ],
  },
  {
    label: 'Flota',
    items: [
      { to: '/flota/unidades', label: 'Unidades', icon: Bus, roles: FLEET_READERS },
      { to: '/flota/mantenimiento', label: 'Mantenimiento', icon: Wrench, roles: [...FLEET_READERS, 'mechanic'] },
      {
        to: '/flota/incidencias',
        label: 'Incidencias',
        icon: TriangleAlert,
        roles: [...FLEET_READERS, 'mechanic', 'driver'],
      },
      { to: '/flota/combustible', label: 'Combustible', icon: Fuel, roles: [...FLEET_READERS, 'driver'] },
      { to: '/flota/modelos', label: 'Modelos', icon: LayoutGrid, roles: FLEET_READERS },
      { to: '/flota/catalogos', label: 'Catálogos', icon: Building2, roles: FLEET_READERS },
    ],
  },
  {
    label: 'Rutas',
    items: [
      { to: '/rutas/buscar', label: 'Buscar salidas', icon: Search, roles: ROUTE_READERS },
      { to: '/rutas', label: 'Rutas', icon: Route, roles: ROUTE_READERS },
      { to: '/rutas/temporadas', label: 'Temporadas', icon: CalendarRange, roles: ROUTE_READERS },
    ],
  },
  {
    label: 'Venta',
    items: [{ to: '/taquilla', label: 'Taquilla', icon: Ticket, roles: TRIP_READERS }],
  },
  {
    label: 'Operación',
    items: [
      { to: '/recorridos', label: 'Recorridos', icon: TramFront, roles: TRIP_READERS },
      { to: '/mis-recorridos', label: 'Mis recorridos', icon: TramFront, roles: ['driver', 'collector'] },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/usuarios', label: 'Usuarios', icon: ShieldCheck, roles: ['admin'] },
      { to: '/configuracion', label: 'Configuración', icon: Settings, roles: ['hr'] },
      { to: '/bitacora', label: 'Bitácora', icon: ScrollText, roles: ['admin'] },
    ],
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
  nomina: 'Nómina',
  'mi-cuenta': 'Mi cuenta',
  configuracion: 'Configuración',
  bitacora: 'Bitácora',
  flota: 'Flota',
  modelos: 'Modelos',
  catalogos: 'Catálogos',
  unidades: 'Unidades',
  mantenimiento: 'Mantenimiento',
  incidencias: 'Incidencias',
  combustible: 'Combustible',
  rutas: 'Rutas',
  temporadas: 'Temporadas',
  buscar: 'Buscar salidas',
  recorridos: 'Recorridos',
  'mis-recorridos': 'Mis recorridos',
  taquilla: 'Taquilla',
  nueva: 'Nueva',
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
