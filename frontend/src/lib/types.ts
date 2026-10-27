export const USER_ROLES = [
  'admin',
  'coordinator',
  'supervisor',
  'hr',
  'driver',
  'collector',
  'vendor',
  'viewer',
] as const

export type UserRole = (typeof USER_ROLES)[number]

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  coordinator: 'Coordinador',
  supervisor: 'Supervisor',
  hr: 'Recursos Humanos',
  driver: 'Conductor',
  collector: 'Cobrador',
  vendor: 'Vendedor',
  viewer: 'Consulta',
}

export interface User {
  id: string
  email: string
  fullName: string
  role: UserRole
  isActive: boolean
  lastLogin: string | null
  createdAt: string
  updatedAt: string
}

export interface Paginated<T> {
  data: T[]
  meta: { page: number; limit: number; total: number; totalPages: number }
}
