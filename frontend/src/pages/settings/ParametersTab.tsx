import { useState } from 'react'
import {
  Bus,
  CalendarClock,
  ChevronRight,
  ClipboardCheck,
  FileBadge,
  Lock,
  Route,
  ScrollText,
  Search,
  SearchX,
  Ticket,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import type { SettingItem } from '../../lib/types'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input } from '../../components/ui/Field'
import { SettingsForm } from './SettingsForm'

type ModuleKey = 'staff' | 'fleet' | 'routes' | 'trips' | 'system' | 'upcoming'

// Orden de los módulos; "upcoming" agrupa lo que aún no se aplica y va colapsado al final
const MODULES: { key: ModuleKey; title: string }[] = [
  { key: 'staff', title: 'Personal' },
  { key: 'fleet', title: 'Flota' },
  { key: 'routes', title: 'Rutas' },
  { key: 'trips', title: 'Recorridos' },
  { key: 'system', title: 'Sistema' },
  { key: 'upcoming', title: 'Próximamente' },
]

// Orden y textos de cada grupo; los que no aparecen aquí no se muestran como parámetros.
// Un grupo nuevo solo necesita declararse aquí con su módulo.
const GROUPS: {
  group: string
  module: ModuleKey
  title: string
  description: string
  icon: LucideIcon
}[] = [
  {
    group: 'schedules',
    module: 'staff',
    title: 'Turnos',
    description: 'Límites de jornada (NOM-087 y LFT) que se validan al programar turnos',
    icon: CalendarClock,
  },
  {
    group: 'attendance',
    module: 'staff',
    title: 'Asistencias',
    description: 'Cálculo de retardos, medios días y horas extra',
    icon: ClipboardCheck,
  },
  {
    group: 'documents',
    module: 'staff',
    title: 'Documentos del personal',
    description: 'Alertas de licencias y certificaciones por vencer',
    icon: FileBadge,
  },
  {
    group: 'payroll',
    module: 'staff',
    title: 'Nómina',
    description: 'Reglas de la prenómina',
    icon: Wallet,
  },
  {
    group: 'fleet',
    module: 'fleet',
    title: 'Alertas de flota',
    description: 'Documentos de unidades por vencer, preventivo próximo y rendimiento de combustible bajo',
    icon: Bus,
  },
  {
    group: 'routes',
    module: 'routes',
    title: 'Horarios de ruta',
    description: 'Aviso de horarios cuya vigencia está por terminar',
    icon: Route,
  },
  {
    group: 'security',
    module: 'system',
    title: 'Seguridad de acceso',
    description: 'Bloqueo de cuentas por intentos fallidos',
    icon: Lock,
  },
  {
    group: 'audit',
    module: 'system',
    title: 'Bitácora',
    description: 'Cuánto tiempo se conservan los cambios y eventos de seguridad',
    icon: ScrollText,
  },
  {
    group: 'trips',
    module: 'trips',
    title: 'Recorridos',
    description: 'Generación por adelantado y descanso mínimo de unidades y conductores entre recorridos',
    icon: Route,
  },
  {
    group: 'tickets',
    module: 'upcoming',
    title: 'Boletos',
    description: 'Se aplicarán cuando entre la venta de boletos (Módulo 6)',
    icon: Ticket,
  },
]

// Búsqueda sin distinguir mayúsculas ni acentos
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const isModified = (i: SettingItem) => i.value !== i.default

/** Parámetros operacionales agrupados por módulo; cada tarjeta se guarda por separado. */
export function ParametersTab({ settings }: { settings: SettingItem[] }) {
  const [query, setQuery] = useState('')
  const q = normalize(query.trim())
  const matches = (i: SettingItem) => !q || normalize(`${i.label ?? ''} ${i.description}`).includes(q)

  const modules = MODULES.map((m) => ({
    ...m,
    groups: GROUPS.filter((g) => g.module === m.key)
      .map((g) => {
        const items = settings.filter((s) => s.group === g.group)
        // Si el título del grupo coincide se muestran todos sus campos
        const groupHit = !!q && normalize(g.title).includes(q)
        return {
          ...g,
          items,
          visible: items.filter((i) => groupHit || matches(i)),
        }
      })
      .filter((g) => g.items.length > 0),
  })).filter((m) => m.groups.length > 0)

  const anyVisible = modules.some((m) => m.groups.some((g) => g.visible.length > 0))

  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
      {/* Navegación: lateral en escritorio, chips en pantallas chicas */}
      <nav aria-label="Grupos de parámetros" className="lg:sticky lg:top-4 lg:self-start">
        <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-4 lg:overflow-visible lg:pb-0">
          {modules.map((m) => {
            const modified = m.groups.reduce((n, g) => n + g.items.filter(isModified).length, 0)
            return (
              <li key={m.key} className="contents lg:block">
                <p className="hidden items-center justify-between px-2 text-xs font-semibold tracking-wide text-fg-subtle uppercase lg:flex">
                  {m.title}
                  {modified > 0 && (
                    <span className="font-data text-[0.7rem] font-medium normal-case" title="Parámetros modificados">
                      {modified} mod.
                    </span>
                  )}
                </p>
                <ul className="contents lg:mt-1 lg:block lg:space-y-0.5">
                  {m.groups.map((g) => (
                    <li key={g.group} className="shrink-0">
                      <a
                        href={`#param-${g.group}`}
                        className={cn(
                          'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap text-fg-muted hover:bg-surface-muted hover:text-fg',
                          'ring-1 ring-border lg:ring-0',
                          q && g.visible.length === 0 && 'opacity-40',
                        )}
                        onClick={() => {
                          // Abre el bloque colapsado antes de saltar a él
                          const el = document.getElementById(`param-${g.group}`)
                          el?.closest('details')?.setAttribute('open', '')
                        }}
                      >
                        <g.icon className="size-4 shrink-0 text-fg-subtle" />
                        {g.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="min-w-0 space-y-8">
        <Input
          icon={Search}
          type="search"
          placeholder="Buscar parámetro: retardo, vencimiento, bloqueo…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar parámetro"
        />

        {!anyVisible && (
          <EmptyState
            icon={SearchX}
            title="Sin coincidencias"
            description={`Ningún parámetro coincide con “${query}”.`}
          />
        )}

        {modules.map((m) => {
          const groups = m.groups.filter((g) => !q || g.visible.length > 0)
          if (groups.length === 0) return null
          const cards = groups.map((g) => (
            <section key={g.group} id={`param-${g.group}`} className="scroll-mt-4">
              <SettingsForm
                // Al guardar cambian las fechas y el formulario se vuelve a montar con los valores nuevos
                key={`${g.group}-${g.items.map((i) => i.updatedAt).join()}`}
                title={
                  <span className="flex items-center gap-2">
                    <g.icon className="size-4 text-fg-subtle" />
                    {g.title}
                  </span>
                }
                description={g.description}
                items={g.items}
                visible={q ? g.visible.map((i) => i.key) : undefined}
                markModified
                resettable
              />
            </section>
          ))

          if (m.key === 'upcoming')
            return (
              <details key={m.key} open={!!q} className="group space-y-4">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-fg-muted">
                  <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
                  {m.title}
                  <Badge>aún no se aplican</Badge>
                </summary>
                <div className="space-y-4 opacity-80">{cards}</div>
              </details>
            )

          return (
            <div key={m.key} className="space-y-4">
              <h2 className="text-sm font-semibold tracking-wide text-fg-subtle uppercase">{m.title}</h2>
              {cards}
            </div>
          )
        })}
      </div>
    </div>
  )
}
