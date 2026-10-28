// Zonas horarias de México que se asignan a las ciudades (mismas que acepta el servidor)
export const MX_TIMEZONES = [
  { id: 'America/Mexico_City', label: 'Centro (CDMX, Guadalajara, Monterrey…)' },
  { id: 'America/Cancun', label: 'Sureste (Quintana Roo)' },
  { id: 'America/Merida', label: 'Centro · Mérida' },
  { id: 'America/Monterrey', label: 'Centro · Monterrey' },
  { id: 'America/Matamoros', label: 'Frontera noreste (horario de verano de EUA)' },
  { id: 'America/Chihuahua', label: 'Chihuahua' },
  { id: 'America/Ciudad_Juarez', label: 'Ciudad Juárez (horario de verano de EUA)' },
  { id: 'America/Ojinaga', label: 'Ojinaga (horario de verano de EUA)' },
  { id: 'America/Mazatlan', label: 'Pacífico (Sinaloa, Nayarit, BCS)' },
  { id: 'America/Bahia_Banderas', label: 'Bahía de Banderas' },
  { id: 'America/Hermosillo', label: 'Sonora (sin horario de verano)' },
  { id: 'America/Tijuana', label: 'Noroeste (Baja California, con horario de verano)' },
] as const

export const DEFAULT_TIMEZONE = 'America/Mexico_City'

/** Desfase actual contra UTC: 'UTC−6' */
export function utcOffsetLabel(tz: string, at = new Date()) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value
  return (part ?? 'GMT').replace('GMT', 'UTC').replace('-', '−') || 'UTC'
}

/** Desfase actual contra UTC en minutos (centro de México = −360). */
export function utcOffsetMinutes(tz: string, at = new Date()) {
  const m = utcOffsetLabel(tz, at).match(/([+−])(d+)(?::(d+))?/)
  if (!m) return 0
  return (m[1] === '−' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0))
}

/** Diferencia de hora de pared hoy entre dos zonas, en palabras. */
export function zoneGapLabel(fromTz: string, toTz: string, toName: string) {
  const h = (utcOffsetMinutes(toTz) - utcOffsetMinutes(fromTz)) / 60
  if (h === 0) return `hoy tienen la misma hora, pero el horario de verano puede separarlas en otras fechas`
  return `hoy ${toName} va ${Math.abs(h)} h ${h > 0 ? 'adelante' : 'atrás'}`
}

/** Hora local actual en la zona: '14:05' */
export const localClock = (tz: string, at = new Date()) =>
  new Intl.DateTimeFormat('es-MX', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at)

/** Instante de una fecha y hora local (YYYY-MM-DD, HH:mm) en la zona dada. */
export function zonedInstant(date: string, time: string, tz: string) {
  const guess = Date.parse(`${date}T${time}:00Z`)
  const off = (t: number) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
        .formatToParts(new Date(t))
        .map((x) => [x.type, x.value]),
    )
    return (
      (Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`) - Math.floor(t / 60000) * 60000) / 60000
    )
  }
  const o1 = off(guess)
  let t = guess - o1 * 60000
  const o2 = off(t)
  if (o2 !== o1) t = guess - o2 * 60000
  return new Date(t)
}

/** Llegada en hora local del destino; `+1` si cae al día siguiente. */
export function arrivalLabel(
  departure: string,
  minutes: number,
  originTz: string,
  destinationTz: string,
  date: string,
) {
  const arrival = new Date(zonedInstant(date, departure, originTz).getTime() + minutes * 60000)
  const time = localClock(destinationTz, arrival)
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: destinationTz }).format(arrival)
  const diff = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000)
  return diff > 0 ? `${time} (+${diff})` : time
}
