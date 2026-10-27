import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import { STAFF_ROLE_LABELS, STAFF_ROLES, type EvaluationCriterion, type StaffRole } from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { Input, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/toast-context'
import { useCriteria } from './useCriteria'

interface Draft {
  id?: string
  name: string
  description: string
  weight: number
  appliesTo: StaffRole[]
  sortOrder: number
}

const EMPTY: Draft = { name: '', description: '', weight: 1, appliesTo: [], sortOrder: 100 }

const rolesLabel = (roles: StaffRole[]) =>
  roles.length === 0 ? 'Todos los puestos' : roles.map((r) => STAFF_ROLE_LABELS[r]).join(', ')

export function CriteriaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const { data: criteria = [] } = useCriteria(true)
  const [draft, setDraft] = useState<Draft | null>(null)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['evaluation-criteria'] })

  const save = useMutation({
    mutationFn: async ({ id, ...data }: Draft) => {
      if (id) await api.patch(`/evaluation-criteria/${id}`, data)
      else await api.post('/evaluation-criteria', data)
    },
    onSuccess: () => {
      toast.success('Criterio guardado')
      invalidate()
      setDraft(null)
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const toggleActive = useMutation({
    mutationFn: (c: EvaluationCriterion) => api.patch(`/evaluation-criteria/${c.id}`, { isActive: !c.isActive }),
    onSuccess: invalidate,
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const toggleRole = (role: StaffRole) =>
    draft &&
    setDraft({
      ...draft,
      appliesTo: draft.appliesTo.includes(role)
        ? draft.appliesTo.filter((r) => r !== role)
        : [...draft.appliesTo, role],
    })

  return (
    <Modal open={open} title="Criterios de evaluación" onClose={onClose}>
      {draft ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate(draft)
          }}
        >
          <Input label="Nombre" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <Textarea
            label="Descripción"
            rows={2}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Peso (1–10)"
              type="number"
              min={1}
              max={10}
              value={draft.weight}
              onChange={(e) => setDraft({ ...draft, weight: Number(e.target.value) })}
            />
            <Input
              label="Orden"
              type="number"
              min={0}
              value={draft.sortOrder}
              onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })}
            />
          </div>
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-fg">Aplica a (ninguno = todos)</legend>
            <div className="flex flex-wrap gap-3">
              {STAFF_ROLES.map((r) => (
                <label key={r} className="flex items-center gap-1 text-sm text-fg">
                  <input type="checkbox" checked={draft.appliesTo.includes(r)} onChange={() => toggleRole(r)} />
                  {STAFF_ROLE_LABELS[r]}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-xs text-fg-muted">Los cambios solo afectan evaluaciones nuevas.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button type="submit" loading={save.isPending} disabled={draft.name.trim().length < 3}>
              Guardar
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <ul className="divide-y divide-border rounded-md border border-border">
            {criteria.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className={c.isActive ? '' : 'text-fg-subtle line-through'}>
                  <span className="font-medium">{c.name}</span> · peso {c.weight}
                  <div className="text-xs text-fg-muted">{rolesLabel(c.appliesTo)}</div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setDraft({
                        id: c.id,
                        name: c.name,
                        description: c.description ?? '',
                        weight: c.weight,
                        appliesTo: c.appliesTo,
                        sortOrder: c.sortOrder,
                      })
                    }
                  >
                    Editar
                  </Button>
                  <Button variant="ghost" onClick={() => toggleActive.mutate(c)}>
                    {c.isActive ? 'Desactivar' : 'Activar'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Button onClick={() => setDraft(EMPTY)}>Nuevo criterio</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
