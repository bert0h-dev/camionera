import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import type { Platform, Terminal } from '../../lib/types'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { LoadingBlock } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/toast-context'
import { usePlatforms } from './useFleet'

type Draft = { id?: string; code: string; name: string }

/** Andenes de una terminal: alta, edición y desactivación (no se borran). */
export function TerminalPlatformsModal({
  terminal,
  canEdit,
  onClose,
}: {
  terminal: Terminal | null
  canEdit: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const platforms = usePlatforms(terminal?.id, true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['fleet', 'platforms'] })

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const body = { code: d.code, name: d.name.trim() || null }
      if (d.id) await api.patch(`/fleet/platforms/${d.id}`, body)
      else await api.post(`/fleet/terminals/${terminal!.id}/platforms`, body)
    },
    onSuccess: () => {
      toast.success('Andén guardado')
      setDraft(null)
      refresh()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const toggle = useMutation({
    mutationFn: (p: Platform) => api.patch(`/fleet/platforms/${p.id}`, { isActive: !p.isActive }),
    onSuccess: refresh,
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const close = () => {
    setDraft(null)
    onClose()
  }

  return (
    <Modal
      open={!!terminal}
      title={terminal ? `Andenes · ${terminal.code}` : ''}
      description="Cada recorrido sale de un andén de su terminal de origen; desactivar uno no lo quita de los horarios"
      onClose={close}
    >
      {platforms.isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-4">
          <ul className="divide-y divide-border rounded-lg border border-border">
            {(platforms.data ?? []).map((p) => (
              <li key={p.id} className={`flex items-center gap-3 px-3 py-2 ${p.isActive ? '' : 'opacity-60'}`}>
                <span className="w-12 font-data text-lg font-semibold">{p.code}</span>
                <span className="flex-1 text-sm">{p.name ?? <span className="text-fg-subtle">—</span>}</span>
                <Badge tone={p.isActive ? 'success' : 'neutral'} dot>
                  {p.isActive ? 'Activo' : 'Inactivo'}
                </Badge>
                {canEdit && (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDraft({ id: p.id, code: p.code, name: p.name ?? '' })}
                    >
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggle.mutate(p)}>
                      {p.isActive ? 'Desactivar' : 'Activar'}
                    </Button>
                  </div>
                )}
              </li>
            ))}
            {!platforms.data?.length && (
              <li className="px-3 py-6 text-center text-sm text-fg-muted">Esta terminal aún no tiene andenes</li>
            )}
          </ul>

          {canEdit &&
            (draft ? (
              <form
                className="grid gap-3 sm:grid-cols-[7rem_1fr_auto] sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault()
                  save.mutate(draft)
                }}
              >
                <Input
                  label="Clave"
                  required
                  maxLength={10}
                  className="font-data uppercase"
                  value={draft.code}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                />
                <Input
                  label="Nombre (opcional)"
                  maxLength={100}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setDraft(null)}>
                    Cancelar
                  </Button>
                  <Button type="submit" loading={save.isPending}>
                    Guardar
                  </Button>
                </div>
              </form>
            ) : (
              <Button variant="secondary" icon={Plus} onClick={() => setDraft({ code: '', name: '' })}>
                Nuevo andén
              </Button>
            ))}
        </div>
      )}
    </Modal>
  )
}
