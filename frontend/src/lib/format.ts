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
