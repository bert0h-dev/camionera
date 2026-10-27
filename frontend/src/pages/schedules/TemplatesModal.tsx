import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import { SHIFT_TYPE_LABELS, SHIFT_TYPES, type ShiftTemplate, type ShiftType } from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/toast-context'
import { useShiftTemplates } from './useScheduleData'

interface Draft {
  id?: string
  name: string
  shiftType: ShiftType
  startTime: string
  endTime: string
  breakMinutes: number
}

const EMPTY: Draft = { name: '', shiftType: 'morning', startTime: '06:00', endTime: '14:00', breakMinutes: 0 }

export function TemplatesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const { data: templates = [] } = useShiftTemplates(true)
  const [draft, setDraft] = useState<Draft | null>(null)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['shift-templates'] })

  const save = useMutation({
    mutationFn: async ({ id, ...data }: Draft) => {
      if (id) await api.patch(`/shift-templates/${id}`, data)
      else await api.post('/shift-templates', data)
    },
    onSuccess: () => {
      toast.success('Plantilla guardada')
      invalidate()
      setDraft(null)
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const toggleActive = useMutation({
    mutationFn: (t: ShiftTemplate) => api.patch(`/shift-templates/${t.id}`, { isActive: !t.isActive }),
    onSuccess: invalidate,
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  return (
    <Modal open={open} title="Plantillas de turno" onClose={onClose}>
      {draft ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate(draft)
          }}
        >
          <Input label="Nombre" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Tipo"
              value={draft.shiftType}
              onChange={(e) => setDraft({ ...draft, shiftType: e.target.value as ShiftType })}
            >
              {SHIFT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SHIFT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
            <Input
              label="Descanso (minutos)"
              type="number"
              min={0}
              value={draft.breakMinutes}
              onChange={(e) => setDraft({ ...draft, breakMinutes: Number(e.target.value) })}
            />
            <Input
              label="Inicio"
              type="time"
              value={draft.startTime}
              onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
            />
            <Input
              label="Fin"
              type="time"
              value={draft.endTime}
              onChange={(e) => setDraft({ ...draft, endTime: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button type="submit" loading={save.isPending} disabled={draft.name.trim().length < 2}>
              Guardar
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className={t.isActive ? '' : 'text-slate-400 line-through'}>
                  <span className="font-medium">{t.name}</span> · {t.startTime}–{t.endTime}
                  {t.breakMinutes > 0 && ` · ${t.breakMinutes} min descanso`}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setDraft({
                        id: t.id,
                        name: t.name,
                        shiftType: t.shiftType,
                        startTime: t.startTime,
                        endTime: t.endTime,
                        breakMinutes: t.breakMinutes,
                      })
                    }
                  >
                    Editar
                  </Button>
                  <Button variant="ghost" onClick={() => toggleActive.mutate(t)}>
                    {t.isActive ? 'Desactivar' : 'Activar'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Button onClick={() => setDraft(EMPTY)}>Nueva plantilla</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
