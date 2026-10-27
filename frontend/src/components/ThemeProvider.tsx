import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { readThemePreference, THEME_STORAGE_KEY, ThemeContext, type ThemePreference } from '../lib/theme'

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPref] = useState<ThemePreference>(readThemePreference)
  const [systemDark, setSystemDark] = useState(() => darkQuery().matches)
  const resolved = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference

  // Seguir al sistema operativo cuando la preferencia es "system"
  useEffect(() => {
    const mq = darkQuery()
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
  }, [resolved])

  const setPreference = useCallback((pref: ThemePreference) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, pref)
    } catch {
      // sin almacenamiento: solo aplica en esta sesión
    }
    setPref(pref)
  }, [])

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
