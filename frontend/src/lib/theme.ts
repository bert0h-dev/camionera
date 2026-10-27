import { createContext, useContext } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'

/** Misma clave que el script inline de index.html (evita el destello al cargar). */
export const THEME_STORAGE_KEY = 'camionera.theme'
/** Tema por defecto cuando el usuario no ha elegido. */
export const DEFAULT_THEME: ThemePreference = 'light'

export function readThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    // almacenamiento bloqueado: usar el default
  }
  return DEFAULT_THEME
}

export interface ThemeContextValue {
  preference: ThemePreference
  resolved: 'light' | 'dark'
  setPreference: (pref: ThemePreference) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>')
  return ctx
}
