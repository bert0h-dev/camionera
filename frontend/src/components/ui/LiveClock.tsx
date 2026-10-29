import { useEffect, useState } from 'react'
import { businessFormat } from '../../lib/format'

const TIME = businessFormat({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** Hora de la central (zona configurada en Parámetros) en ámbar, como en un tablero de andén. */
export function LiveClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="rounded-xl bg-black/25 px-4 py-2.5 text-right ring-1 ring-white/10">
      <div className="font-data text-3xl leading-none font-bold text-amber-400">{TIME.format(now)}</div>
      <div className="mt-1 text-[11px] tracking-wider text-indigo-300 uppercase">Hora de la central</div>
    </div>
  )
}
