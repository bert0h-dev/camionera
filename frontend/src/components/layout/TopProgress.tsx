import { useEffect, useState } from 'react'
import { useIsFetching, useIsMutating } from '@tanstack/react-query'
import { cn } from '../../lib/cn'

const SHOW_DELAY_MS = 150

/**
 * Barra ámbar bajo el topbar mientras cualquier consulta o guardado está en curso.
 * Espera un instante antes de mostrarse para no parpadear en cargas instantáneas.
 */
export function TopProgress() {
  const busy = useIsFetching() + useIsMutating() > 0
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!busy) {
      const t = setTimeout(() => setVisible(false), 200)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setVisible(true), SHOW_DELAY_MS)
    return () => clearTimeout(t)
  }, [busy])

  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden transition-opacity duration-200',
        visible && busy ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div className="animate-progress h-full w-1/3 rounded-full bg-amber-400 shadow-[0_0_8px_rgb(251_191_36/0.8)]" />
    </div>
  )
}
