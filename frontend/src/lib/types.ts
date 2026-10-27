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

export const STAFF_ROLES = ['driver', 'collector', 'mechanic', 'supervisor', 'vendor', 'hr', 'admin_staff'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  driver: 'Conductor',
  collector: 'Cobrador',
  mechanic: 'Mecánico',
  supervisor: 'Supervisor',
  vendor: 'Vendedor / Taquillero',
  hr: 'Recursos Humanos',
  admin_staff: 'Administrativo',
}

export const STAFF_STATUSES = ['active', 'vacation', 'sick_leave', 'suspended', 'inactive'] as const
export type StaffStatus = (typeof STAFF_STATUSES)[number]

export const STAFF_STATUS_LABELS: Record<StaffStatus, string> = {
  active: 'Activo',
  vacation: 'Vacaciones',
  sick_leave: 'Incapacidad',
  suspended: 'Suspendido',
  inactive: 'Baja',
}

/** Rol de sistema sugerido según el puesto (igual que en el backend). */
export const SUGGESTED_USER_ROLE: Record<StaffRole, UserRole> = {
  driver: 'driver',
  collector: 'collector',
  vendor: 'vendor',
  supervisor: 'supervisor',
  hr: 'hr',
  mechanic: 'viewer',
  admin_staff: 'viewer',
}

export interface Staff {
  id: string
  employeeNumber: string
  firstName: string
  lastName: string
  secondLastName: string | null
  curp: string | null
  rfc: string | null
  nss: string | null
  birthDate: string
  email: string | null
  phone: string
  address: string | null
  emergencyContact: string | null
  emergencyPhone: string | null
  role: StaffRole
  status: StaffStatus
  hireDate: string
  terminationDate: string | null
  terminationReason: string | null
  userId: string | null
  user: Pick<User, 'id' | 'email' | 'role' | 'isActive' | 'lastLogin'> | null
  createdAt: string
  updatedAt: string
}
