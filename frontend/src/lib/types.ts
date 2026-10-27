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
  mustChangePassword: boolean
  failedLoginAttempts: number
  lockedUntil: string | null
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

export const LICENSE_TYPES = ['A', 'B', 'C', 'D', 'E'] as const
export type LicenseType = (typeof LICENSE_TYPES)[number]

export const LICENSE_TYPE_LABELS: Record<LicenseType, string> = {
  A: 'A — Pasajeros',
  B: 'B — Carga general',
  C: 'C — Carga 2 y 3 ejes',
  D: 'D — Chofer guía turismo',
  E: 'E — Doble articulado / materiales peligrosos',
}

export const CERTIFICATION_TYPES = ['medical_exam', 'first_aid', 'defensive_driving', 'training', 'other'] as const
export type CertificationType = (typeof CERTIFICATION_TYPES)[number]

export const CERTIFICATION_TYPE_LABELS: Record<CertificationType, string> = {
  medical_exam: 'Examen médico',
  first_aid: 'Primeros auxilios',
  defensive_driving: 'Manejo defensivo',
  training: 'Capacitación',
  other: 'Otro',
}

export type DocumentStatus = 'valid' | 'expiring' | 'expired'

interface DocumentState {
  status: DocumentStatus
  daysToExpiry: number | null
}

export interface StaffLicense extends DocumentState {
  id: string
  staffId: string
  licenseType: LicenseType
  licenseNumber: string
  issuer: string
  issueDate: string
  expiryDate: string
  notes: string | null
}

export interface StaffCertification extends DocumentState {
  id: string
  staffId: string
  type: CertificationType
  name: string
  issuer: string | null
  certificateNumber: string | null
  issueDate: string
  expiryDate: string | null
  notes: string | null
}

export interface ExpirationItem extends DocumentState {
  kind: 'license' | 'certification'
  id: string
  label: string
  number: string | null
  expiryDate: string
  staff: Pick<Staff, 'id' | 'employeeNumber' | 'firstName' | 'lastName' | 'secondLastName' | 'role'>
}

export interface Compliance {
  compliant: boolean
  missing: string[]
}

export const SHIFT_TYPES = ['morning', 'afternoon', 'night', 'split'] as const
export type ShiftType = (typeof SHIFT_TYPES)[number]

export const SHIFT_TYPE_LABELS: Record<ShiftType, string> = {
  morning: 'Matutino',
  afternoon: 'Vespertino',
  night: 'Nocturno',
  split: 'Partido',
}

export interface ShiftTemplate {
  id: string
  name: string
  shiftType: ShiftType
  startTime: string
  endTime: string
  breakMinutes: number
  isActive: boolean
}

export interface Schedule {
  id: string
  staffId: string
  scheduleDate: string
  startAt: string | null
  endAt: string | null
  shiftType: ShiftType | null
  breakMinutes: number
  isRestDay: boolean
  templateId: string | null
  template: Pick<ShiftTemplate, 'id' | 'name'> | null
  notes: string | null
  overrideReason: string | null
  workedHours: number
  staff: Pick<Staff, 'id' | 'employeeNumber' | 'firstName' | 'lastName' | 'secondLastName' | 'role'>
}

export const ATTENDANCE_STATUSES = ['present', 'late', 'half_day', 'absent', 'excused'] as const
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'Asistió',
  late: 'Retardo',
  half_day: 'Medio día',
  absent: 'Falta',
  excused: 'Justificada',
}

export interface Attendance {
  id: string
  staffId: string
  attendanceDate: string
  scheduleId: string | null
  checkInAt: string | null
  checkOutAt: string | null
  status: AttendanceStatus
  lateMinutes: number
  workedMinutes: number
  overtimeMinutes: number
  source: 'manual' | 'self' | 'system'
  notes: string | null
}

type ScheduleCore = Omit<Schedule, 'staff' | 'template'>

export interface AttendanceDayRow {
  staff: Schedule['staff'] & { status: StaffStatus }
  schedule: ScheduleCore | null
  attendance: Attendance | null
}

export interface MyToday {
  staff: Staff
  schedule: ScheduleCore | null
  attendance: Attendance | null
}

// ---------- Evaluaciones ----------

export const EVALUATION_STATUSES = ['draft', 'finalized', 'acknowledged'] as const
export type EvaluationStatus = (typeof EVALUATION_STATUSES)[number]

export const EVALUATION_STATUS_LABELS: Record<EvaluationStatus, string> = {
  draft: 'Borrador',
  finalized: 'Finalizada',
  acknowledged: 'Enterado',
}

export interface EvaluationCriterion {
  id: string
  name: string
  description: string | null
  weight: number
  appliesTo: StaffRole[]
  isActive: boolean
  sortOrder: number
}

export interface EvaluationScore {
  id: string
  criterionId: string
  criterionName: string
  weight: number
  score: number | null
  comment: string | null
  criterion: { description: string | null }
}

export interface Evaluation {
  id: string
  staffId: string
  staff: Schedule['staff'] & { status: StaffStatus; userId: string | null }
  evaluator: { id: string; fullName: string }
  periodStart: string
  periodEnd: string
  status: EvaluationStatus
  overallScore: string | null
  strengths: string | null
  improvements: string | null
  comments: string | null
  employeeComment: string | null
  finalizedAt: string | null
  acknowledgedAt: string | null
  scores?: EvaluationScore[]
}

export interface EvaluationDetail extends Evaluation {
  scores: EvaluationScore[]
  attendance: {
    present: number
    late: number
    halfDay: number
    absent: number
    excused: number
    lateMinutes: number
    overtimeMinutes: number
  }
}

// ---------- Dashboard ----------

export type AttendanceCounts = Record<AttendanceStatus, number>

export interface DashboardSummary {
  team: {
    staff: {
      total: number
      active: number
      vacation: number
      sickLeave: number
      suspended: number
      byRole: { role: StaffRole; count: number }[]
    }
    today: {
      scheduled: number
      started: number
      onShiftNow: number
      working: number
      missingCheckIn: number
      attendance: AttendanceCounts
    }
    board: BoardEntry[]
    trend: ({ date: string } & AttendanceCounts)[]
    documents: { alertDays: number; expired: number; expiring: number }
    evaluations: { drafts: number; pendingAcknowledge: number }
  } | null
  me: {
    month: string
    attendance: AttendanceCounts
    lateMinutes: number
    overtimeMinutes: number
  } | null
}

export type BoardState = 'missing' | 'scheduled' | 'on_time' | 'late' | 'done' | 'absent' | 'excused'

export interface BoardEntry {
  staff: Pick<Staff, 'id' | 'firstName' | 'lastName' | 'secondLastName' | 'role'>
  startAt: string
  endAt: string
  checkInAt: string | null
  lateMinutes: number
  state: BoardState
}

// ---------- Insights de empleados ----------

export type TodayState = 'none' | 'rest' | 'scheduled' | 'missing' | 'on_shift' | 'late' | 'done' | 'absent' | 'excused'

export interface StaffWithInsights extends Staff {
  documents: { status: DocumentStatus; daysToExpiry: number | null } | null
  today: { state: TodayState; startAt: string | null; endAt: string | null }
}

export interface StaffStats {
  active: number
  away: number
  suspended: number
  withExpiredDocs: number
  withExpiringDocs: number
  withoutAccess: number
  alertDays: number
}

export interface StaffSummary {
  attendance: { rate: number | null; records: number; absent: number }
  week: { hours: number; max: number }
  lastEvaluation: { id: string; score: string | null; periodEnd: string } | null
  license: { type: LicenseType; expiryDate: string; status: DocumentStatus; daysToExpiry: number | null } | null
  requiresLicense: boolean
  nextShifts: Omit<Schedule, 'staff' | 'template' | 'workedHours'>[]
}

// ---------- Nómina ----------

export type PaymentType = 'daily' | 'monthly'
export type PaymentFrequency = 'weekly' | 'biweekly'
export type PayrollStatus = 'draft' | 'closed' | 'paid'
export type AdjustmentType = 'perception' | 'deduction'

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = { daily: 'Salario diario', monthly: 'Sueldo mensual' }
export const PAYMENT_FREQUENCY_LABELS: Record<PaymentFrequency, string> = { weekly: 'Semanal', biweekly: 'Quincenal' }
export const PAYROLL_STATUS_LABELS: Record<PayrollStatus, string> = {
  draft: 'Borrador',
  closed: 'Cerrada',
  paid: 'Pagada',
}

export interface Compensation {
  id: string
  staffId: string
  paymentType: PaymentType
  baseSalary: string
  paymentFrequency: PaymentFrequency
  effectiveFrom: string
  notes: string | null
  createdAt: string
  createdBy: { fullName: string }
}

export interface PayrollPeriod {
  id: string
  name: string
  frequency: PaymentFrequency
  periodStart: string
  periodEnd: string
  status: PayrollStatus
  generatedAt: string | null
  closedAt: string | null
  paidAt: string | null
  netTotal: string | number
  _count: { entries: number }
}

export interface PayrollAdjustment {
  id: string
  type: AdjustmentType
  concept: string
  amount: string
  createdAt: string
}

export interface PayrollEntry {
  id: string
  staffId: string
  staff: Schedule['staff'] & { status: StaffStatus }
  paymentType: PaymentType
  baseSalary: string
  dailySalary: string
  periodDays: number
  payableDays: string
  absences: number
  halfDays: number
  lates: number
  lateMinutes: number
  lateAbsences: number
  overtimeDouble: string
  overtimeTriple: string
  sundaysWorked: number
  salaryAmount: string
  overtimeAmount: string
  sundayPremium: string
  totalPerceptions: string
  totalDeductions: string
  netPay: string
  adjustments: PayrollAdjustment[]
}

export interface PayrollPeriodDetail extends Omit<PayrollPeriod, 'netTotal' | '_count'> {
  createdBy: { fullName: string }
  entries: PayrollEntry[]
  totals: { employees: number; perceptions: number; deductions: number; net: number; overtime: number }
  missingSalary: Schedule['staff'][]
}

export interface PayrollSettings {
  latePenaltyEnabled: boolean
  latesPerAbsence: number
}

export interface MyPayslip extends Omit<PayrollEntry, 'staff' | 'adjustments'> {
  period: Pick<PayrollPeriod, 'id' | 'name' | 'periodStart' | 'periodEnd' | 'status' | 'paidAt'>
  adjustments: Pick<PayrollAdjustment, 'type' | 'concept' | 'amount'>[]
}

// ---------- Cuentas ----------

export interface UserSession {
  id: string
  userAgent: string | null
  ipAddress: string | null
  startedAt: string
  lastActiveAt: string
  expiresAt: string
  current: boolean
}

export interface UserDetail extends User {
  staff: Pick<Staff, 'id' | 'employeeNumber' | 'firstName' | 'lastName' | 'secondLastName' | 'role'> | null
  sessions: UserSession[]
  activity: {
    id: string
    tableName: string
    recordId: string
    actionType: 'insert' | 'update' | 'delete'
    createdAt: string
  }[]
}

// ---------- Configuración ----------

export type SettingValue = number | string | boolean

export interface SettingItem {
  key: string
  group: string
  value: SettingValue
  default: SettingValue
  type: 'number' | 'string' | 'boolean'
  label: string | null
  description: string
  unit: string | null
  min?: number
  max?: number
  decimals: number
  maxLength?: number
  updatedAt: string | null
  updatedBy: string | null
}

// ---------- Bitácora ----------

export type SecurityEventType =
  | 'login_success'
  | 'login_failed'
  | 'account_locked'
  | 'account_unlocked'
  | 'logout'
  | 'password_changed'
  | 'password_reset_requested'
  | 'password_reset'
  | 'sessions_revoked'
  | 'token_reuse'

export const SECURITY_EVENT_LABELS: Record<SecurityEventType, string> = {
  login_success: 'Inicio de sesión',
  login_failed: 'Inicio fallido',
  account_locked: 'Cuenta bloqueada',
  account_unlocked: 'Cuenta desbloqueada',
  logout: 'Cierre de sesión',
  password_changed: 'Cambio de contraseña',
  password_reset_requested: 'Solicitud de recuperación',
  password_reset: 'Contraseña restablecida',
  sessions_revoked: 'Sesiones cerradas',
  token_reuse: 'Reutilización de sesión',
}

type AuditUser = { id: string; fullName: string; email: string } | null

export interface AuditLogEntry {
  id: string
  userId: string | null
  user: AuditUser
  tableName: string
  recordId: string
  actionType: 'insert' | 'update' | 'delete'
  oldValues: Record<string, unknown> | null
  newValues: Record<string, unknown> | null
  createdAt: string
}

export interface SecurityEventEntry {
  id: string
  type: SecurityEventType
  userId: string | null
  user: AuditUser
  email: string | null
  ipAddress: string | null
  userAgent: string | null
  details: Record<string, unknown> | null
  createdAt: string
}

export interface AuditSummary {
  changes: number
  logins: number
  failed: number
  locked: number
  retentionDays: number
}

export interface AuditFilters {
  tables: { name: string; count: number }[]
  users: { id: string; fullName: string; email: string }[]
}

// ---------- Flota ----------

export const BUS_TYPES = ['standard', 'executive', 'luxury', 'double_decker'] as const
export type BusType = (typeof BUS_TYPES)[number]

export const BUS_TYPE_LABELS: Record<BusType, string> = {
  standard: 'Estándar',
  executive: 'Ejecutivo',
  luxury: 'Lujo',
  double_decker: 'Doble piso',
}

export interface FuelType {
  id: string
  name: string
  unit: string
  isActive: boolean
  _count?: { busModels: number }
}

export interface City {
  id: string
  name: string
  state: string
  isActive: boolean
  _count?: { terminals: number }
}

export interface Terminal {
  id: string
  code: string
  name: string
  cityId: string
  address: string | null
  isActive: boolean
  city: { id: string; name: string; state: string }
}

export const CELL_TYPES = ['seat', 'aisle', 'bathroom', 'stairs', 'driver', 'door', 'cafe'] as const
export type CellType = (typeof CELL_TYPES)[number]

export const SEAT_CATEGORIES = ['normal', 'preferred', 'accessible'] as const
export type SeatCategory = (typeof SEAT_CATEGORIES)[number]

export interface LayoutCell {
  r: number
  c: number
  type: CellType
  number?: string
  category?: SeatCategory
}

export interface LayoutFloor {
  rows: number
  cols: number
  cells: LayoutCell[]
}

export interface BusLayout {
  floors: LayoutFloor[]
}

export interface BusModel {
  id: string
  brand: string
  model: string
  busType: BusType
  fuelTypeId: string
  fuelType: { id: string; name: string; unit: string }
  tankCapacity: string | null
  expectedEfficiency: string | null
  specifications: string | null
  features: string[]
  preventiveKm: number | null
  preventiveDays: number | null
  layout: BusLayout
  seatCount: number
  isActive: boolean
}
