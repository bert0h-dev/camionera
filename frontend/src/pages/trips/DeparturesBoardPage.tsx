import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Maximize, Minimize, MonitorPlay } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { cn } from '../../lib/cn'
import type { BoardDeparture, DeparturesBoard } from '../../lib/types'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Field'
import { HeroStat } from '../../components/ui/HeroStat'
import { LiveClock } from '../../components/ui/LiveClock'
import { PageHeader } from '../../components/ui/PageHeader'
import { EmptyState } from '../../components/ui/EmptyState'
import { LoadingBlock } from '../../components/ui/Spinner'

const STORAGE_KEY = 'departures-board-terminal'

const readTerminal = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

const saveTerminal = (id: string) => {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Sin almacenamiento: se vuelve a elegir al abrir
  }
}

/** Color del estado en el tablero (claro y oscuro a pantalla completa). */
function statusClass(d: BoardDeparture) {
  if (d.departed || d.status === 'in_transit' || d.status === 'completed') return 'text-fg-muted'
  if (d.status === 'cancelled') return 'text-red-600 dark:text-red-400'
  if (d.status === 'delayed') return 'text-orange-600 dark:text-orange-400'
  if (d.status === 'boarding') return 'text-emerald-600 dark:text-emerald-400'
  return 'text-fg'
}

function BoardRows({ rows, dark }: { rows: BoardDeparture[]; dark: boolean }) {
  const head = cn(
    'px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase',
    dark ? 'text-slate-400' : 'text-fg-muted',
  )
  return (
    <table className="w-full">
      <thead>
        <tr className={cn('border-b', dark ? 'border-slate-700' : 'border-border')}>
          <th className={head}>Hora</th>
          <th className={head}>Destino</th>
          <th className={cn(head, 'text-center')}>Andén</th>
          <th className={head}>Estado</th>
          <th className={cn(head, 'text-right')}>Unidad</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((d) => (
          <tr
            key={d.id}
            className={cn(
              'border-b last:border-0',
              dark ? 'border-slate-800' : 'border-border',
              (d.departed || d.status === 'cancelled') && 'opacity-60',
            )}
          >
            <td className={cn('px-4 py-3 font-data font-bold', dark ? 'text-4xl text-amber-300' : 'text-3xl')}>
              {d.time}
            </td>
            <td className="px-4 py-3">
              <div className={cn('font-semibold', dark ? 'text-3xl text-white' : 'text-2xl')}>{d.destination}</div>
              <div className={cn('text-sm', dark ? 'text-slate-400' : 'text-fg-muted')}>
                {d.stops.length ? `Vía ${d.stops.join(', ')}` : 'Directo'} ·{' '}
                <span className="font-data">{d.tripNumber}</span>
              </div>
            </td>
            <td className="px-4 py-3 text-center">
              {d.platform ? (
                <span
                  className={cn(
                    'inline-flex min-w-14 justify-center rounded-lg px-3 py-1 font-data font-bold',
                    dark ? 'bg-amber-400 text-4xl text-slate-950' : 'bg-primary text-3xl text-primary-fg',
                  )}
                >
                  {d.platform.code}
                </span>
              ) : (
                <span className={dark ? 'text-2xl text-slate-500' : 'text-xl text-fg-subtle'}>—</span>
              )}
            </td>
            <td className={cn('px-4 py-3 font-semibold', dark ? 'text-2xl' : 'text-xl', statusClass(d))}>
              {d.statusLabel}
            </td>
            <td
              className={cn(
                'px-4 py-3 text-right font-data',
                dark ? 'text-2xl text-slate-300' : 'text-xl text-fg-muted',
              )}
            >
              {d.busNumber ?? '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Próximas salidas de una terminal en letras grandes; se actualiza solo y puede ir a pantalla completa. */
function DeparturesBoardPage() {
  const [terminalId, setTerminalId] = useState(readTerminal)
  const [fullscreen, setFullscreen] = useState(false)
  const boardRef = useRef<HTMLDivElement>(null)

  const { data, error, isLoading, isFetching } = useQuery({
    queryKey: ['trips', 'board', terminalId],
    queryFn: async () =>
      (await api.get<DeparturesBoard>('/trips/departures-board', { params: { terminalId: terminalId || undefined } }))
        .data,
    refetchInterval: 30_000,
  })

  const terminals = data?.terminals ?? []

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === boardRef.current && !!boardRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void boardRef.current?.requestFullscreen?.()
  }

  const rows = data?.terminal ? data.departures : []
  const upcoming = rows.filter((d) => !d.departed && d.status !== 'cancelled')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tablero de salidas"
        description="Próximas salidas con su andén; se actualiza cada 30 segundos"
        refreshing={isFetching && !isLoading}
        meta={
          <div className="w-72">
            <Select
              aria-label="Terminal"
              value={data?.terminal?.id ?? terminalId}
              onChange={(e) => {
                setTerminalId(e.target.value)
                saveTerminal(e.target.value)
              }}
            >
              {!terminals.length && <option value="">Sin terminales con rutas</option>}
              {terminals.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} · {t.name}
                </option>
              ))}
            </Select>
          </div>
        }
        aside={<LiveClock />}
        actions={
          <Button variant="glass" icon={Maximize} onClick={toggleFullscreen} disabled={!data?.terminal}>
            Pantalla completa
          </Button>
        }
        stats={
          <>
            <HeroStat
              label="Por salir"
              value={upcoming.length}
              tone="primary"
              loading={isLoading}
              hint="próximas 6 h"
            />
            <HeroStat
              label="Abordando"
              value={upcoming.filter((d) => d.status === 'boarding').length}
              loading={isLoading}
              hint="pasajeros subiendo"
            />
            <HeroStat
              label="Retrasados"
              value={upcoming.filter((d) => d.status === 'delayed').length}
              tone={upcoming.some((d) => d.status === 'delayed') ? 'warning' : 'neutral'}
              loading={isLoading}
              hint="aún no salen"
            />
            <HeroStat
              label="Sin andén"
              value={upcoming.filter((d) => !d.platform).length}
              tone={upcoming.some((d) => !d.platform) ? 'warning' : 'neutral'}
              loading={isLoading}
              hint="asígnalo en el recorrido"
            />
          </>
        }
      />

      {error && <Alert tone="danger">{apiErrorMessage(error, 'No se pudo cargar el tablero')}</Alert>}

      <div
        ref={boardRef}
        className={cn(
          fullscreen
            ? 'flex h-full flex-col overflow-auto bg-slate-950 p-8'
            : 'rounded-xl bg-surface ring-1 ring-border',
        )}
      >
        {fullscreen && (
          <div className="mb-6 flex items-center justify-between text-white">
            <div>
              <div className="text-sm tracking-widest text-slate-400 uppercase">Salidas</div>
              <div className="text-4xl font-semibold">{data?.terminal?.name}</div>
            </div>
            <div className="flex items-center gap-4">
              <LiveClock />
              <Button variant="glass" size="icon" icon={Minimize} aria-label="Salir" onClick={toggleFullscreen} />
            </div>
          </div>
        )}
        {isLoading ? (
          <LoadingBlock text="Cargando salidas…" />
        ) : !rows.length ? (
          <EmptyState
            icon={MonitorPlay}
            title="Sin salidas próximas"
            description="No hay recorridos de esta terminal en las próximas 6 horas"
          />
        ) : (
          <BoardRows rows={rows} dark={fullscreen} />
        )}
      </div>
    </div>
  )
}

export default DeparturesBoardPage
