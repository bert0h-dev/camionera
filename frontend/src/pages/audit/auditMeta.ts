import type { BadgeTone } from '../../components/ui/Badge'
import type { SecurityEventType } from '../../lib/types'

export const DATE_TIME = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'medium',
  timeZone: 'America/Mexico_City',
})

export const ACTION_META: Record<'insert' | 'update' | 'delete', { label: string; tone: BadgeTone }> = {
  insert: { label: 'Alta', tone: 'success' },
  update: { label: 'Cambio', tone: 'primary' },
  delete: { label: 'Baja', tone: 'danger' },
}

export const EVENT_TONES: Record<SecurityEventType, BadgeTone> = {
  login_success: 'success',
  login_failed: 'warning',
  account_locked: 'danger',
  account_unlocked: 'info',
  logout: 'neutral',
  password_changed: 'primary',
  password_reset_requested: 'info',
  password_reset: 'primary',
  sessions_revoked: 'neutral',
  token_reuse: 'danger',
}

export const FAILED_REASONS: Record<string, string> = {
  wrong_password: 'contraseña incorrecta',
  unknown_email: 'correo no registrado',
  inactive: 'usuario inactivo',
  locked: 'cuenta bloqueada',
}
