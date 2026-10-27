import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { formatTime } from '../../lib/format'
import { STAFF_ROLE_LABELS, type BoardEntry, type BoardState } from '../../lib/types'

const STATES: Record<BoardState, { label: string; className: string }> = {
  missing: { label: 'Sin entrada', className: 'text-red-400' },
  scheduled: { label: 'Programado', className: 'text-indigo-300' },
  on_time: { label: 'En turno', className: 'text-emerald-400' },
  late: { label: 'Retardo', className: 'text-amber-400' },
  done: { label: 'Terminó', className: 'text-slate-400' },
  absent: { label: 'Falta', className: 'text-red-400' },
  excused: { label: 'Justificada', className: 'text-sky-300' },
}

/** "Juan Pérez López" → "J. PÉREZ LÓPEZ", como en los tableros de andén. */
const boardName = (s: BoardEntry['staff']) =>
  `${s.firstName[0]}. ${s.lastName} ${s.secondLastName ?? ''}`.trim().toUpperCase()

/** Tablero oscuro estilo andén con los turnos de hoy. */
export function EntryBoard({ entries, limit = 7 }: { entries: BoardEntry[]; limit?: number }) {
  const rows = entries.slice(0, limit)
  return (
    <div className="font-data overflow-hidden rounded-xl bg-[#0b0a2a] text-[13px] text-indigo-100 ring-1 ring-black/10">
      <div className="grid grid-cols-[4.5rem_1fr_8rem_8.5rem] gap-3 bg-[#13123a] px-4 py-2.5 text-[11px] tracking-widest text-indigo-400 uppercase">
        <span>Hora</span>
        <span>Empleado</span>
        <span className="hidden sm:block">Puesto</span>
        <span>Estado</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center font-sans text-sm text-indigo-300">Nadie tiene turno hoy.</p>
      ) : (
        rows.map((e) => {
          const st = STATES[e.state]
          return (
            <Link
              key={e.staff.id}
              to={`/personal/${e.staff.id}`}
              className={cn(
                'grid grid-cols-[4.5rem_1fr_8rem_8.5rem] items-center gap-3 border-t border-white/5 px-4 py-2.5 transition-colors hover:bg-white/5',
                e.state === 'missing' && 'bg-red-500/10',
              )}
            >
              <span className="font-bold text-amber-400">{formatTime(e.startAt)}</span>
              <span className="truncate">{boardName(e.staff)}</span>
              <span className="hidden truncate text-indigo-300 sm:block">
                {STAFF_ROLE_LABELS[e.staff.role].toUpperCase()}
              </span>
              <span className={cn('font-semibold', st.className)}>
                {st.label.toUpperCase()}
                {e.state === 'late' && ` +${e.lateMinutes}′`}
              </span>
            </Link>
          )
        })
      )}
      {entries.length > limit && (
        <div className="border-t border-white/5 px-4 py-2 text-right font-sans text-xs text-indigo-300">
          y {entries.length - limit} más hoy
        </div>
      )}
    </div>
  )
}
