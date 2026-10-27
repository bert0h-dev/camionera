// Marcas diacríticas combinables (acentos) que deja normalize('NFD')
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')

/** Minúsculas y sin acentos, para que "nomina" encuentre "Nómina". */
export const normalize = (s: string) => s.normalize('NFD').replace(DIACRITICS, '').toLowerCase()
