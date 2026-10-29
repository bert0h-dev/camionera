import { lazy, type ComponentType } from 'react'

type Loader = () => Promise<{ default: ComponentType }>

// Cada pantalla vive en su propio paquete y se descarga al abrirla (o antes, al pasar el cursor por el menú)
export const loaders = {
  home: () => import('../pages/HomePage'),
  account: () => import('../pages/account/AccountPage'),
  forceChange: () => import('../pages/auth/ForceChangePasswordPage'),
  forgot: () => import('../pages/auth/ForgotPasswordPage'),
  reset: () => import('../pages/auth/ResetPasswordPage'),
  users: () => import('../pages/users/UsersPage'),
  userDetail: () => import('../pages/users/UserDetailPage'),
  staffList: () => import('../pages/staff/StaffListPage'),
  staffDetail: () => import('../pages/staff/StaffDetailPage'),
  staffForm: () => import('../pages/staff/StaffFormPage'),
  schedules: () => import('../pages/schedules/SchedulesPage'),
  attendance: () => import('../pages/attendance/AttendancePage'),
  evaluations: () => import('../pages/evaluations/EvaluationsPage'),
  evaluationDetail: () => import('../pages/evaluations/EvaluationDetailPage'),
  payroll: () => import('../pages/payroll/PayrollPage'),
  payrollPeriod: () => import('../pages/payroll/PayrollPeriodPage'),
  settings: () => import('../pages/settings/SettingsPage'),
  audit: () => import('../pages/audit/AuditPage'),
  busModels: () => import('../pages/fleet/BusModelsPage'),
  busModelForm: () => import('../pages/fleet/BusModelFormPage'),
  fleetCatalogs: () => import('../pages/fleet/FleetCatalogsPage'),
  buses: () => import('../pages/fleet/BusesPage'),
  busDetail: () => import('../pages/fleet/BusDetailPage'),
  busForm: () => import('../pages/fleet/BusFormPage'),
  maintenance: () => import('../pages/fleet/MaintenancePage'),
  maintenanceOrder: () => import('../pages/fleet/MaintenanceOrderPage'),
  incidents: () => import('../pages/fleet/IncidentsPage'),
  incidentDetail: () => import('../pages/fleet/IncidentDetailPage'),
  fuel: () => import('../pages/fleet/FuelPage'),
  routes: () => import('../pages/routes/RoutesPage'),
  routeDetail: () => import('../pages/routes/RouteDetailPage'),
  seasons: () => import('../pages/routes/SeasonsPage'),
  departures: () => import('../pages/routes/DeparturesSearchPage'),
} satisfies Record<string, Loader>

export type PageKey = keyof typeof loaders

export const lazyPage = (key: PageKey) => lazy(loaders[key])

// Primer segmento de la URL → pantalla, para precargar desde el menú o el buscador
const BY_SEGMENT: Record<string, PageKey> = {
  '': 'home',
  'mi-cuenta': 'account',
  usuarios: 'users',
  personal: 'staffList',
  turnos: 'schedules',
  asistencias: 'attendance',
  evaluaciones: 'evaluations',
  nomina: 'payroll',
  configuracion: 'settings',
  bitacora: 'audit',
  'flota/modelos': 'busModels',
  'flota/catalogos': 'fleetCatalogs',
  'flota/unidades': 'buses',
  'flota/mantenimiento': 'maintenance',
  'flota/incidencias': 'incidents',
  'flota/combustible': 'fuel',
  rutas: 'routes',
  'rutas/temporadas': 'seasons',
  'rutas/buscar': 'departures',
}

const requested = new Set<PageKey>()

/** Descarga por adelantado el código de la pantalla de `path`; no hace nada si ya se pidió. */
export function preloadPath(path: string) {
  // Los módulos con submenú (flota/…) se identifican por sus dos primeros segmentos
  const [, first = '', second] = path.split('/')
  const key = BY_SEGMENT[`${first}/${second}`] ?? BY_SEGMENT[first]
  if (!key || requested.has(key)) return
  requested.add(key)
  void loaders[key]().catch(() => requested.delete(key))
}
