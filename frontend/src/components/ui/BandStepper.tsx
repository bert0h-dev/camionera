import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './Button'

interface BandStepperProps {
  label: string
  onPrev: () => void
  onNext: () => void
  nextDisabled?: boolean
  /** Botón para volver al periodo actual; se oculta si ya se está en él */
  todayLabel?: string
  onToday?: () => void
  isToday?: boolean
  prevLabel: string
  nextLabel: string
}

/** Navegación de periodo (semana o día) dentro de la banda, con la etiqueta en ámbar mono. */
export function BandStepper({
  label,
  onPrev,
  onNext,
  nextDisabled,
  todayLabel,
  onToday,
  isToday,
  prevLabel,
  nextLabel,
}: BandStepperProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="glass" size="icon" icon={ChevronLeft} onClick={onPrev} aria-label={prevLabel} />
      <span className="font-data min-w-44 px-1 text-center text-base font-bold tracking-wide text-amber-400 uppercase">
        {label}
      </span>
      <Button
        variant="glass"
        size="icon"
        icon={ChevronRight}
        onClick={onNext}
        disabled={nextDisabled}
        aria-label={nextLabel}
      />
      {todayLabel && onToday && !isToday && (
        <Button variant="glass" size="sm" onClick={onToday}>
          {todayLabel}
        </Button>
      )}
    </div>
  )
}
