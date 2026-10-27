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
} as const satisfies Record<string, SettingDefinition>;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> =
  (typeof SETTINGS)[K]['type'] extends 'number'
    ? number
    : (typeof SETTINGS)[K]['type'] extends 'boolean'
      ? boolean
      : string;

export const isSettingKey = (key: string): key is SettingKey => key in SETTINGS;
