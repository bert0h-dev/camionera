/** Columnas @db.Date llegan como ISO en UTC: se toma solo la parte de fecha. */
export const dateOnly = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '')

export const formatDate = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const [y, m, d] = dateOnly(iso).split('-')
  return `${d}/${m}/${y}`
}

export const formatPhone = (phone: string | null | undefined) =>
  phone && phone.length === 10 ? `${phone.slice(0, 2)} ${phone.slice(2, 6)} ${phone.slice(6)}` : (phone ?? '—')

export const staffFullName = (s: { firstName: string; lastName: string; secondLastName?: string | null }) =>
  [s.firstName, s.lastName, s.secondLastName].filter(Boolean).join(' ')

/** Texto de días restantes: "vence en 5 días", "venció hace 3 días", "vence hoy". */
export function daysLabel(days: number | null) {
  if (days === null) return 'Sin vencimiento'
  if (days === 0) return 'Vence hoy'
  if (days === 1) return 'Vence mañana'
  if (days > 0) return `Vence en ${days} días`
  return days === -1 ? 'Venció ayer' : `Venció hace ${-days} días`
}

// Zona horaria de la central: la fija AppLayout con el parámetro company.timezone
let businessTz = 'America/Mexico_City'
export const getBusinessTimezone = () => businessTz
export function setBusinessTimezone(tz: string | null | undefined) {
  if (tz) businessTz = tz
}

const formatters = new Map<string, Intl.DateTimeFormat>()

/**
 * Formateador en la zona de la central. Se usa como `Intl.DateTimeFormat` (`.format(fecha)`),
 * pero toma la zona vigente en cada llamada.
 */
export function businessFormat(options: Intl.DateTimeFormatOptions, locale = 'es-MX') {
  return {
    format(date: Date | number) {
      const key = `${locale}|${businessTz}|${JSON.stringify(options)}`
      let f = formatters.get(key)
      if (!f) {
        f = new Intl.DateTimeFormat(locale, { ...options, timeZone: businessTz })
        formatters.set(key, f)
      }
      return f.format(date)
    },
  }
}

const TIME = businessFormat({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const INSTANT_DATE = businessFormat({ day: '2-digit', month: '2-digit', year: 'numeric' })
const DAY_KEY = businessFormat({}, 'en-CA')

/** Hora local de la central (HH:mm) de un instante ISO. */
export const formatTime = (iso: string | null | undefined) => (iso ? TIME.format(new Date(iso)) : '')

/** Fecha local de la central (DD/MM/AAAA) de un instante ISO; `formatDate` es solo para columnas de fecha. */
export const formatInstantDate = (iso: string | null | undefined) => (iso ? INSTANT_DATE.format(new Date(iso)) : '—')

/** Hoy en la central como 'AAAA-MM-DD'. */
export const todayKey = () => DAY_KEY.format(new Date())

/** Suma días a una fecha 'AAAA-MM-DD'. */
export function addDaysKey(key: string, days: number) {
  const d = new Date(`${key}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Lunes de la semana de una fecha 'AAAA-MM-DD'. */
export function mondayOf(key: string) {
  const weekday = (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7
  return addDaysKey(key, -weekday)
}

const WEEKDAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

/** 'Lun 02/11' */
export function dayLabel(key: string) {
  const [, m, d] = key.split('-')
  return `${WEEKDAY_SHORT[new Date(`${key}T00:00:00Z`).getUTCDay()]} ${d}/${m}`
}

export const formatHours = (h: number) => `${Math.round(h * 10) / 10} h`

/** 135 → '2 h 15 min' */
export function formatMinutes(minutes: number) {
  if (!minutes) return '0 min'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return [h && `${h} h`, m && `${m} min`].filter(Boolean).join(' ')
}

const MONEY = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

/** 1234.5 → '$1,234.50' */
export const formatMoney = (value: number | string | null | undefined) =>
  value == null || value === '' ? '—' : MONEY.format(Number(value))
