// Parámetros configurables del sistema con su valor por defecto.
// Si no hay fila en system_settings se usa el default.

export interface SettingDefinition {
  type: 'number' | 'string' | 'boolean';
  default: number | string | boolean;
  description: string;
  min?: number;
  max?: number;
}

export const SETTINGS = {
  'documents.expiry_alert_days': {
    type: 'number',
    default: 30,
    min: 1,
    max: 365,
    description:
      'Días de anticipación para alertar vencimiento de licencias y certificaciones',
  },
  'schedules.max_shift_hours': {
    type: 'number',
    default: 14,
    min: 1,
    max: 24,
    description:
      'Horas máximas trabajadas por turno, sin contar descansos (NOM-087-SCT)',
  },
  'schedules.min_rest_hours': {
    type: 'number',
    default: 8,
    min: 0,
    max: 24,
    description: 'Horas mínimas de descanso entre turnos (NOM-087-SCT)',
  },
  'schedules.max_weekly_hours': {
    type: 'number',
    default: 48,
    min: 1,
    max: 168,
    description:
      'Horas máximas trabajadas por semana, de lunes a domingo (LFT)',
  },
  'attendance.late_tolerance_minutes': {
    type: 'number',
    default: 10,
    min: 0,
    max: 120,
    description:
      'Minutos de tolerancia después del inicio del turno antes de contar retardo',
  },
  'attendance.half_day_percent': {
    type: 'number',
    default: 50,
    min: 1,
    max: 100,
    description:
      'Porcentaje mínimo del turno trabajado; por debajo cuenta como medio día',
  },
  'attendance.overtime_threshold_minutes': {
    type: 'number',
    default: 30,
    min: 0,
    max: 240,
    description:
      'Minutos después del fin del turno a partir de los cuales se cuentan horas extra',
  },
  'attendance.early_check_in_minutes': {
    type: 'number',
    default: 60,
    min: 0,
    max: 240,
    description:
      'Minutos antes del inicio del turno en que el empleado ya puede registrar su entrada',
  },
  'payroll.late_penalty_enabled': {
    type: 'boolean',
    default: false,
    description: 'Descontar faltas por acumulación de retardos en la prenómina',
  },
  'payroll.lates_per_absence': {
    type: 'number',
    default: 3,
    min: 1,
    max: 20,
    description:
      'Retardos que equivalen a una falta (si el descuento está activo)',
  },
  'security.max_failed_logins': {
    type: 'number',
    default: 5,
    min: 3,
    max: 20,
    description:
      'Intentos fallidos de inicio de sesión antes de bloquear la cuenta',
  },
  'security.lockout_minutes': {
    type: 'number',
    default: 15,
    min: 1,
    max: 1440,
    description:
      'Minutos que la cuenta queda bloqueada tras superar los intentos fallidos',
  },
} as const satisfies Record<string, SettingDefinition>;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> =
  (typeof SETTINGS)[K]['type'] extends 'number'
    ? number
    : (typeof SETTINGS)[K]['type'] extends 'boolean'
      ? boolean
      : string;

export const isSettingKey = (key: string): key is SettingKey => key in SETTINGS;
