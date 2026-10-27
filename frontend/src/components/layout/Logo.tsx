import { Bus } from 'lucide-react'
import { cn } from '../../lib/cn'

/** Marca: ícono de autobús en ámbar sobre índigo. */
export function Logo({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 text-indigo-950 shadow-lg shadow-amber-500/20">
        <Bus className="size-5" strokeWidth={2.25} />
      </span>
      {!collapsed && (
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight text-white">Central Camionera</div>
          <div className="text-[11px] font-medium tracking-wider text-indigo-300/80 uppercase">ERP Operativo</div>
        </div>
      )}
    </div>
  )
}
