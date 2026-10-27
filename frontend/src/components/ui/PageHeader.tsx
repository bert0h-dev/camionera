import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  /** Botones a la derecha; usar variant "accent" para la acción principal y "glass" para las demás */
  actions?: ReactNode
  /** Contenido extra bajo el título (selector de semana o día, datos del empleado…) */
  meta?: ReactNode
  /** Bloque a la derecha en lugar de las acciones (reloj de la central) */
  aside?: ReactNode
  /** Cifras clave que flotan sobre el borde inferior de la banda (HeroStat) */
  stats?: ReactNode
  /** Pestañas u otro contenido pegado al borde inferior de la banda */
  bottom?: ReactNode
}

/**
 * Banda índigo de cada pantalla, continuación del topbar: título, acciones y,
 * opcionalmente, cifras clave flotando sobre su borde inferior.
 */
export function PageHeader({ title, description, actions, meta, aside, stats, bottom }: PageHeaderProps) {
  return (
    <div className={cn(stats && 'mb-2')}>
      <div
        className={cn(
          'bg-band -mx-4 -mt-4 px-4 pt-4 text-white md:-mx-8 md:-mt-8 md:px-8 md:pt-6',
          stats ? 'pb-20' : bottom ? 'pb-0' : 'pb-8',
        )}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
            {description && <p className="mt-1 text-sm text-indigo-200">{description}</p>}
            {meta && <div className="mt-3">{meta}</div>}
          </div>
          {(actions || aside) && (
            <div className="flex flex-wrap items-center gap-2">
              {aside}
              {actions}
            </div>
          )}
        </div>
        {bottom && <div className="mt-5">{bottom}</div>}
      </div>
      {stats && <div className="-mt-14 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats}</div>}
    </div>
  )
}
