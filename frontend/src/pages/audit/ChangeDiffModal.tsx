import { cn } from '../../lib/cn'
import type { AuditLogEntry } from '../../lib/types'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { ACTION_META, DATE_TIME } from './auditMeta'

// Campos técnicos que no aportan al revisar un cambio
const HIDDEN = new Set(['updatedAt', 'createdAt'])

const show = (v: unknown) => {
  if (v === undefined) return '—'
  if (v === null) return 'vacío'
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

/** Detalle de un cambio: cada campo con su valor anterior y nuevo; los distintos se resaltan. */
export function ChangeDiffModal({ entry, onClose }: { entry: AuditLogEntry | null; onClose: () => void }) {
  return (
    <Modal
      open={!!entry}
      size="lg"
      title={entry ? `${ACTION_META[entry.actionType].label} en ${entry.tableName}` : ''}
      description={
        entry ? `${entry.user?.fullName ?? 'Sistema'} · ${DATE_TIME.format(new Date(entry.createdAt))}` : undefined
      }
      onClose={onClose}
    >
      {entry && <Diff entry={entry} />}
    </Modal>
  )
}

function Diff({ entry }: { entry: AuditLogEntry }) {
  const before = entry.oldValues ?? {}
  const after = entry.newValues ?? {}
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !HIDDEN.has(k))
  const changed = (k: string) => JSON.stringify(before[k]) !== JSON.stringify(after[k])
  // Primero lo que cambió
  keys.sort((a, b) => Number(changed(b)) - Number(changed(a)) || a.localeCompare(b))
  const nChanged = keys.filter(changed).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={ACTION_META[entry.actionType].tone} dot>
          {ACTION_META[entry.actionType].label}
        </Badge>
        <span className="font-data text-xs text-fg-muted">registro {entry.recordId}</span>
        <span className="text-xs text-fg-muted">· {nChanged} campo(s) distinto(s)</span>
      </div>
      {keys.length === 0 ? (
        <p className="text-sm text-fg-muted">Este cambio no guardó valores.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full table-fixed text-sm">
            <thead className="bg-surface-muted text-xs tracking-wide text-fg-muted uppercase">
              <tr>
                <th className="w-1/4 px-3 py-2 text-left font-semibold">Campo</th>
                <th className="px-3 py-2 text-left font-semibold">Antes</th>
                <th className="px-3 py-2 text-left font-semibold">Después</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {keys.map((k) => {
                const diff = changed(k)
                return (
                  <tr key={k} className={cn(!diff && 'text-fg-subtle')}>
                    <td className="font-data px-3 py-2 align-top text-xs break-words">{k}</td>
                    <td
                      className={cn(
                        'font-data px-3 py-2 align-top text-xs break-words',
                        diff &&
                          k in before &&
                          'bg-red-50 text-red-800 line-through dark:bg-red-500/10 dark:text-red-300',
                      )}
                    >
                      {k in before ? show(before[k]) : '—'}
                    </td>
                    <td
                      className={cn(
                        'font-data px-3 py-2 align-top text-xs break-words',
                        diff && 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300',
                      )}
                    >
                      {k in after ? show(after[k]) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
