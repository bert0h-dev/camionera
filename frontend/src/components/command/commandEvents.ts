// El buscador se abre desde el atajo de teclado o desde el botón de la barra superior
const OPEN_EVENT = 'camionera:open-command'

export const openCommandPalette = () => window.dispatchEvent(new Event(OPEN_EVENT))

export function onOpenCommandPalette(handler: () => void) {
  window.addEventListener(OPEN_EVENT, handler)
  return () => window.removeEventListener(OPEN_EVENT, handler)
}

/** "Mac" muestra ⌘K; el resto, Ctrl K. */
export const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

const RECENT_KEY = 'camionera.recent'
const MAX_RECENT = 5

export interface RecentItem {
  to: string
  label: string
  hint?: string
  kind: 'page' | 'staff' | 'user'
}

export function readRecent(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as RecentItem[]) : []
  } catch {
    return []
  }
}

export function pushRecent(item: RecentItem) {
  try {
    const list = [item, ...readRecent().filter((r) => r.to !== item.to)].slice(0, MAX_RECENT)
    localStorage.setItem(RECENT_KEY, JSON.stringify(list))
  } catch {
    // sin almacenamiento: los recientes solo se pierden
  }
}
