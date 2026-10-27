import { Logo } from './Logo'
import { Spinner } from '../ui/Spinner'

/** Pantalla de arranque mientras se verifica la sesión. */
export function AppSplash() {
  return (
    <div className="bg-band flex min-h-screen flex-col items-center justify-center gap-8 text-white">
      <Logo className="scale-125" />
      <div className="flex items-center gap-3 text-sm text-indigo-200">
        <Spinner size="sm" className="text-amber-400" />
        Cargando Central Camionera…
      </div>
    </div>
  )
}
