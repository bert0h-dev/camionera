import { cn } from '../../lib/cn'

const SIZES = { sm: 'size-4 border-2', md: 'size-6 border-2', lg: 'size-10 border-[3px]' }

/** Indicador de carga circular; toma el color del texto (currentColor). */
export function Spinner({
  size = 'md',
  className,
  label = 'Cargando',
}: {
  size?: keyof typeof SIZES
  className?: string
  label?: string
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        'inline-block shrink-0 animate-spin rounded-full border-current border-t-transparent opacity-80',
        SIZES[size],
        className,
      )}
    />
  )
}

/** Bloque centrado con spinner y texto, para secciones que aún no tienen datos. */
export function LoadingBlock({ text = 'Cargando…', className }: { text?: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-3 py-10 text-sm text-fg-muted', className)}>
      <Spinner size="sm" className="text-primary" />
      {text}
    </div>
  )
}
