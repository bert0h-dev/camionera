// Parámetros configurables del sistema con su valor por defecto.
// Si no hay fila en system_settings se usa el default.

export interface SettingDefinition {
  type: 'number' | 'string' | 'boolean';
  default: number | string | boolean;
  description: string;
  /** Nombre corto para la interfaz (si falta se usa la descripción) */
  label?: string;
  /** Unidad mostrada junto al valor: %, min, h, días… */
  unit?: string;
  min?: number;
  max?: number;
  /** Decimales permitidos en números (0 = entero) */
  decimals?: number;
  maxLength?: number;
  /** Formato obligatorio para textos no vacíos */
  pattern?: string;
  patternMessage?: string;
}

/** Grupo del parámetro: la parte antes del primer punto de la clave. */
export const settingGroup = (key: string) => key.split('.')[0];

export const SETTINGS = {
  'documents.expiry_alert_days': {
    label: 'Aviso de vencimiento de documentos',
    unit: 'días',
    type: 'number',
    default: 30,
    min: 1,
    max: 365,
    description:
      'Días de anticipación para alertar vencimiento de licencias y certificaciones',
  },
  'schedules.max_shift_hours': {
    label: 'Horas máximas por turno',
    unit: 'h',
    type: 'number',
    default: 14,
    min: 1,
    max: 24,
    description:
      'Horas máximas trabajadas por turno, sin contar descansos (NOM-087-SCT)',
  },
  'schedules.min_rest_hours': {
    label: 'Descanso mínimo entre turnos',
    unit: 'h',
    type: 'number',
    default: 8,
    min: 0,
    max: 24,
    description: 'Horas mínimas de descanso entre turnos (NOM-087-SCT)',
  },
  'schedules.max_weekly_hours': {
    label: 'Horas máximas por semana',
    unit: 'h',
    type: 'number',
    default: 48,
    min: 1,
    max: 168,
    description:
      'Horas máximas trabajadas por semana, de lunes a domingo (LFT)',
  },
  'attendance.late_tolerance_minutes': {
    label: 'Tolerancia de retardo',
    unit: 'min',
    type: 'number',
    default: 10,
    min: 0,
    max: 120,
    description:
      'Minutos de tolerancia después del inicio del turno antes de contar retardo',
  },
  'attendance.half_day_percent': {
    label: 'Mínimo trabajado para no ser medio día',
    unit: '%',
    type: 'number',
    default: 50,
    min: 1,
    max: 100,
    description:
      'Porcentaje mínimo del turno trabajado; por debajo cuenta como medio día',
  },
  'attendance.overtime_threshold_minutes': {
    label: 'Mínimo para contar horas extra',
    unit: 'min',
    type: 'number',
    default: 30,
    min: 0,
    max: 240,
    description:
      'Minutos después del fin del turno a partir de los cuales se cuentan horas extra',
  },
  'attendance.early_check_in_minutes': {
    label: 'Entrada anticipada permitida',
    unit: 'min',
    type: 'number',
    default: 60,
    min: 0,
    max: 240,
    description:
      'Minutos antes del inicio del turno en que el empleado ya puede registrar su entrada',
  },
  'payroll.late_penalty_enabled': {
    label: 'Descontar faltas por retardos',
    type: 'boolean',
    default: false,
    description: 'Descontar faltas por acumulación de retardos en la prenómina',
  },
  'payroll.lates_per_absence': {
    label: 'Retardos que equivalen a una falta',
    unit: 'retardos',
    type: 'number',
    default: 3,
    min: 1,
    max: 20,
    description:
      'Retardos que equivalen a una falta (si el descuento está activo)',
  },
  'security.max_failed_logins': {
    label: 'Intentos fallidos antes de bloquear',
    unit: 'intentos',
    type: 'number',
    default: 5,
    min: 3,
    max: 20,
    description:
      'Intentos fallidos de inicio de sesión antes de bloquear la cuenta',
  },
  'security.lockout_minutes': {
    label: 'Duración del bloqueo',
    unit: 'min',
    type: 'number',
    default: 15,
    min: 1,
    max: 1440,
    description:
      'Minutos que la cuenta queda bloqueada tras superar los intentos fallidos',
  },

  // ---------- Empresa (datos que saldrán en boletos, recibos y reportes) ----------
  'company.legal_name': {
    type: 'string',
    default: '',
    label: 'Razón social',
    maxLength: 200,
    description: 'Nombre legal de la empresa como aparece ante el SAT',
  },
  'company.trade_name': {
    type: 'string',
    default: 'Central Camionera',
    label: 'Nombre comercial',
    maxLength: 120,
    description: 'Nombre con el que se presenta a los pasajeros',
  },
  'company.rfc': {
    type: 'string',
    default: '',
    label: 'RFC',
    maxLength: 13,
    pattern: '^[A-ZÑ&]{3,4}\\d{6}[A-Z0-9]{3}$',
    patternMessage:
      'RFC con formato inválido (12 caracteres para persona moral, 13 para física)',
    description: 'Registro Federal de Contribuyentes',
  },
  'company.tax_regime': {
    type: 'string',
    default: '',
    label: 'Régimen fiscal',
    maxLength: 120,
    description:
      'Clave y nombre del régimen fiscal (p. ej. 601 General de Ley Personas Morales)',
  },
  'company.address': {
    type: 'string',
    default: '',
    label: 'Domicilio fiscal',
    maxLength: 300,
    description: 'Calle, número, colonia, municipio, estado y código postal',
  },
  'company.phone': {
    type: 'string',
    default: '',
    label: 'Teléfono',
    maxLength: 10,
    pattern: '^\\d{10}$',
    patternMessage: 'El teléfono debe tener 10 dígitos',
    description: 'Teléfono de atención',
  },
  'company.email': {
    type: 'string',
    default: '',
    label: 'Correo de contacto',
    maxLength: 255,
    pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
    patternMessage: 'Correo inválido',
    description: 'Correo de atención a clientes',
  },
  'company.website': {
    type: 'string',
    default: '',
    label: 'Sitio web',
    maxLength: 200,
    pattern: '^https?://\\S+$',
    patternMessage: 'El sitio debe empezar con http:// o https://',
    description: 'Página web de la empresa',
  },

  // ---------- Impuestos ----------
  'taxes.vat_rate': {
    type: 'number',
    default: 16,
    min: 0,
    max: 30,
    decimals: 2,
    unit: '%',
    label: 'Tasa de IVA',
    description: 'IVA aplicado a la venta de boletos',
  },
  'taxes.prices_include_vat': {
    type: 'boolean',
    default: true,
    label: 'Las tarifas ya incluyen IVA',
    description:
      'Si está activo, el IVA se desglosa del precio; si no, se suma al precio de la tarifa',
  },

  // ---------- Comisiones ----------
  'commissions.vendor_percent': {
    type: 'number',
    default: 0,
    min: 0,
    max: 50,
    decimals: 2,
    unit: '%',
    label: 'Comisión del vendedor en taquilla',
    description:
      'Porcentaje del importe de cada boleto vendido en taquilla que corresponde al vendedor',
  },
  'commissions.online_percent': {
    type: 'number',
    default: 0,
    min: 0,
    max: 50,
    decimals: 2,
    unit: '%',
    label: 'Cargo por servicio en línea',
    description:
      'Porcentaje que se agrega al importe de los boletos comprados en línea',
  },

  // ---------- Bitácora ----------
  'audit.retention_days': {
    type: 'number',
    default: 365,
    min: 30,
    max: 3650,
    label: 'Conservar bitácora',
    unit: 'días',
    description:
      'Días que se conservan los cambios y eventos de seguridad; lo más antiguo se borra cada noche',
  },

  // ---------- Boletos (se usarán en el Módulo 6) ----------
  'tickets.cancellation_hours': {
    type: 'number',
    default: 2,
    min: 0,
    max: 72,
    label: 'Cancelación hasta',
    unit: 'h antes',
    description:
      'Horas antes de la salida en que todavía se puede cancelar un boleto',
  },
  'tickets.refund_percent': {
    type: 'number',
    default: 80,
    min: 0,
    max: 100,
    label: 'Reembolso al cancelar',
    unit: '%',
    description:
      'Porcentaje del importe que se devuelve al cancelar dentro del plazo',
  },
  'tickets.checkin_minutes': {
    type: 'number',
    default: 30,
    min: 0,
    max: 180,
    label: 'Check-in antes de la salida',
    unit: 'min',
    description:
      'Minutos antes de la salida en que el pasajero debe presentarse a abordar',
  },
  'tickets.max_per_purchase': {
    type: 'number',
    default: 10,
    min: 1,
    max: 50,
    label: 'Boletos por compra',
    unit: 'boletos',
    description: 'Máximo de boletos en una sola compra',
  },

  // ---------- Flota ----------
  'fleet.document_alert_days': {
    type: 'number',
    default: 30,
    min: 1,
    max: 365,
    label: 'Aviso de vencimiento de documentos de unidades',
    unit: 'días',
    description:
      'Días de anticipación para alertar el vencimiento del seguro, la tarjeta de circulación, permisos y verificaciones',
  },

  'fleet.maintenance_alert_days': {
    type: 'number',
    default: 7,
    min: 1,
    max: 90,
    label: 'Aviso de preventivo por días',
    unit: 'días',
    description:
      'Días antes de la fecha del próximo servicio preventivo para marcarlo como próximo',
  },
  'fleet.maintenance_alert_km': {
    type: 'number',
    default: 1000,
    min: 100,
    max: 20000,
    label: 'Aviso de preventivo por km',
    unit: 'km',
    description:
      'Kilómetros antes del próximo servicio preventivo para marcarlo como próximo',
  },

  // ---------- Recorridos (se usarán en el Módulo 4) ----------
  'trips.unit_turnaround_minutes': {
    type: 'number',
    default: 30,
    min: 0,
    max: 240,
    label: 'Tiempo entre recorridos de una unidad',
    unit: 'min',
    description:
      'Minutos mínimos entre la llegada de una unidad y su siguiente salida (limpieza y revisión)',
  },
  'trips.driver_gap_minutes': {
    type: 'number',
    default: 30,
    min: 0,
    max: 240,
    label: 'Tiempo entre recorridos de un conductor',
    unit: 'min',
    description:
      'Minutos mínimos entre el fin de un recorrido y el inicio del siguiente para el mismo conductor',
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

/** Grupos que RRHH puede ver y editar; el admin edita todos (undefined = sin restricción). */
const HR_GROUPS = ['documents', 'schedules', 'attendance', 'payroll'];

export const editableGroups = (role: string) =>
  role === 'admin' ? undefined : HR_GROUPS;
