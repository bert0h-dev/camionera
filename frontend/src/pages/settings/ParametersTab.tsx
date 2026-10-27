import { CalendarClock, ClipboardCheck, FileBadge, Lock, Route, Ticket, Wallet, type LucideIcon } from 'lucide-react'
import type { SettingItem } from '../../lib/types'
import { SettingsForm } from './SettingsForm'

// Orden y textos de cada grupo; los que no aparecen aquí no se muestran como parámetros
const GROUPS: { group: string; title: string; description: string; icon: LucideIcon }[] = [
  {
    group: 'schedules',
    title: 'Turnos',
    description: 'Límites de jornada (NOM-087 y LFT) que se validan al programar turnos',
    icon: CalendarClock,
  },
  {
    group: 'attendance',
    title: 'Asistencias',
    description: 'Cálculo de retardos, medios días y horas extra',
    icon: ClipboardCheck,
  },
  {
    group: 'documents',
    title: 'Documentos del personal',
    description: 'Alertas de licencias y certificaciones por vencer',
    icon: FileBadge,
  },
  { group: 'payroll', title: 'Nómina', description: 'Reglas de la prenómina', icon: Wallet },
  {
    group: 'security',
    title: 'Seguridad de acceso',
    description: 'Bloqueo de cuentas por intentos fallidos',
    icon: Lock,
  },
  {
    group: 'tickets',
    title: 'Boletos',
    description: 'Se aplicarán cuando entre la venta de boletos (Módulo 6)',
    icon: Ticket,
  },
  {
    group: 'trips',
    title: 'Recorridos',
    description: 'Se aplicarán al asignar unidades y conductores (Módulo 4)',
    icon: Route,
  },
]

/** Parámetros operacionales por grupo; cada tarjeta se guarda por separado. */
export function ParametersTab({ settings }: { settings: SettingItem[] }) {
  const sections = GROUPS.map((g) => ({ ...g, items: settings.filter((s) => s.group === g.group) })).filter(
    (g) => g.items.length > 0,
  )
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {sections.map((s) => (
        <SettingsForm
          // Al guardar cambian las fechas y el formulario se vuelve a montar con los valores nuevos
          key={`${s.group}-${s.items.map((i) => i.updatedAt).join()}`}
          title={
            <span className="flex items-center gap-2">
              <s.icon className="size-4 text-fg-subtle" />
              {s.title}
            </span>
          }
          description={s.description}
          items={s.items}
          resettable
        />
      ))}
    </div>
  )
}
