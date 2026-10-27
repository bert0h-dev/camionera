import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'

interface DropdownProps {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode
  align?: 'left' | 'right'
  className?: string
  children: (close: () => void) => ReactNode
}

/** Menú desplegable simple: se cierra al hacer clic fuera o con Escape. */
export function Dropdown({ trigger, align = 'right', className, children }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute top-full z-40 mt-2 min-w-52 rounded-xl border border-border bg-surface p-1.5 shadow-pop animate-pop-in',
            align === 'right' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function DropdownItem({
  icon: Icon,
  active,
  danger,
  onClick,
  children,
}: {
  icon?: LucideIcon
  active?: boolean
  danger?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
        danger
          ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10'
          : 'text-fg hover:bg-surface-sunken',
        active && 'bg-primary-soft font-medium text-primary-soft-fg hover:bg-primary-soft',
      )}
    >
      {Icon && <Icon className="size-4 shrink-0" />}
      <span className="flex-1">{children}</span>
    </button>
  )
}

export function DropdownSeparator() {
  return <div className="my-1.5 h-px bg-border" />
}
