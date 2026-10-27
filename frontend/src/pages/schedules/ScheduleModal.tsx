import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { api, apiErrorMessage } from '../../lib/api'
import { dayLabel, formatTime } from '../../lib/format'
import { SHIFT_TYPE_LABELS, SHIFT_TYPES, type Schedule } from '../../lib/types'
import { useAuth } from '../../auth/useAuth'
import { Button } from '../../components/ui/Button'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/toast-context'
import { useShiftTemplates } from './useScheduleData'

const CUSTOM = 'custom'
const REST = 'rest'

const schema = z
  .object({
    mode: z.string(), // id de plantilla, 'custom' o 'rest'
    startTime: z.string(),
    endTime: z.string(),
    shiftType: z.enum(SHIFT_TYPES),
    breakMinutes: z.coerce.number<string>().int().min(0, 'No puede ser negativo').max(480),
    notes: z.string(),
  })
  .refine((v) => v.mode !== CUSTOM || (/^\d{2}:\d{2}$/.test(v.startTime) && /^\d{2}:\d{2}$/.test(v.endTime)), {
    path: ['startTime'],
    message: 'Indica hora de inicio y fin',
  })
type FormInput = z.input<typeof schema>
type FormValues = z.output<typeof schema>

export interface ScheduleTarget {
  staffId: string
  staffName: string
  date: string
  schedule: Schedule | null
}

export function ScheduleModal({ target, onClose }: { target: ScheduleTarget | null; onClose: () => void }) {
  return (
    <Modal open={!!target} title={target ? `${target.staffName} · ${dayLabel(target.date)}` : ''} onClose={onClose}>
      {/* Se monta por cada celda abierta: el formulario empieza con los datos de ese turno */}
      {target && <ScheduleForm key={`${target.staffId}|${target.date}`} target={target} onClose={onClose} />}
    </Modal>
  )
}

function ScheduleForm({ target, onClose }: { target: ScheduleTarget; onClose: () => void }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const toast = useToast()
  const queryClient = useQueryClient()
  const { data: templates = [] } = useShiftTemplates()
  // Reglas rotas devueltas por la API; permiten al admin forzar con motivo
  const [violations, setViolations] = useState<string[] | null>(null)
  const [overrideReason, setOverrideReason] = useState('')

  const s = target.schedule
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      // '' en altas = primera plantilla (puede cargar después de abrir)
      mode: s ? (s.isRestDay ? REST : (s.templateId ?? CUSTOM)) : '',
      startTime: s?.startAt ? formatTime(s.startAt) : '',
      endTime: s?.endAt ? formatTime(s.endAt) : '',
      shiftType: s?.shiftType ?? 'morning',
      breakMinutes: String(s?.breakMinutes ?? 0),
      notes: s?.notes ?? '',
    },
  })
  const mode = useWatch({ control, name: 'mode' }) || templates[0]?.id || CUSTOM

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['schedules'] })

  const save = useMutation({
    mutationFn: async ({ values, force }: { values: FormValues; force: boolean }) => {
      const selected = values.mode || mode
      const shift =
        selected === REST
          ? { isRestDay: true }
          : selected === CUSTOM
            ? {
                isRestDay: false,
                startTime: values.startTime,
                endTime: values.endTime,
                shiftType: values.shiftType,
                breakMinutes: values.breakMinutes,
              }
            : { isRestDay: false, templateId: selected }
      const payload = {
        ...shift,
        notes: values.notes,
        ...(force && { force: true, overrideReason }),
      }
      if (target.schedule) await api.patch(`/schedules/${target.schedule.id}`, payload)
      else await api.post('/schedules', { ...payload, staffId: target.staffId, scheduleDate: target.date })
    },
    onSuccess: () => {
      toast.success('Turno guardado')
      invalidate()
      onClose()
    },
    onError: (err) => {
      const message = (err as AxiosError<{ message?: string | string[] }>).response?.data?.message
      // Las violaciones de reglas llegan como lista: se muestran en el modal
      if ((err as AxiosError).response?.status === 400 && Array.isArray(message)) setViolations(message)
      else toast.error(apiErrorMessage(err))
    },
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/schedules/${target.schedule!.id}`),
    onSuccess: () => {
      toast.success('Turno eliminado')
      invalidate()
      onClose()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const submit = (force: boolean) => handleSubmit((values) => save.mutate({ values, force }))

  return (
    <form onSubmit={submit(false)} className="space-y-4" noValidate>
      <Select label="Turno" {...register('mode')}>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} ({t.startTime}–{t.endTime})
          </option>
        ))}
        <option value={CUSTOM}>Horario personalizado…</option>
        <option value={REST}>Día de descanso</option>
      </Select>

      {mode === CUSTOM && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Inicio" type="time" error={errors.startTime?.message} {...register('startTime')} />
          <Input label="Fin (si es menor, termina al día siguiente)" type="time" {...register('endTime')} />
          <Select label="Tipo" {...register('shiftType')}>
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
            error={errors.breakMinutes?.message}
            {...register('breakMinutes')}
          />
        </div>
      )}

      <Textarea label="Notas" rows={2} {...register('notes')} />

      {violations && (
        <div className="space-y-2 rounded-md border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 p-3 text-sm text-red-800 dark:text-red-300">
          <ul className="list-disc pl-5">
            {violations.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
          {isAdmin ? (
            <>
              <Input
                label="Motivo para forzar (queda en auditoría)"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
              <Button
                variant="danger"
                disabled={overrideReason.trim().length < 5}
                loading={save.isPending}
                onClick={submit(true)}
              >
                Forzar y guardar
              </Button>
            </>
          ) : (
            <p className="text-xs">Solo un administrador puede forzar un turno que rompe las reglas.</p>
          )}
        </div>
      )}

      <div className="flex justify-between gap-2 pt-1">
        <div>
          {target?.schedule && (
            <Button
              variant="ghost"
              className="text-red-600 dark:text-red-300"
              loading={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Eliminar
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending}>
            Guardar
          </Button>
        </div>
      </div>
    </form>
  )
}
