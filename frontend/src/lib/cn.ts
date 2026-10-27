import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Registrar los tokens propios para que tailwind-merge resuelva bien los conflictos
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        'app',
        'surface',
        'surface-muted',
        'surface-sunken',
        'border',
        'border-strong',
        'fg',
        'fg-muted',
        'fg-subtle',
        'primary',
        'primary-hover',
        'primary-fg',
        'primary-soft',
        'primary-soft-fg',
        'link',
        'ring',
        'accent',
        'accent-soft',
        'accent-soft-fg',
        'overlay',
      ],
    },
  },
})

/** Une clases condicionales y resuelve conflictos de Tailwind (la última gana). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
