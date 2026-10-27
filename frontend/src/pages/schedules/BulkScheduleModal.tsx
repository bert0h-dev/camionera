import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import { dayLabel, staffFullName } from '../../lib/format'
import type { Staff } from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/toast-context'
import { useShiftTemplates } from './useScheduleData'

const WEEKDAYS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
]
const REST = 'rest'

interface BulkResult {
  created: number
  skipped: { staffId: string; date: string; reason: string }[]
}

interface Props {
  open: boolean
  staff: Staff[]
  defaultFrom: string
  defaultTo: string
  onClose: () => void
}

export function BulkScheduleModal({ open, onClose, ...props }: Props) {
  return (
    <Modal open={open} title="Asignar turnos en bloque" onClose={onClose}>
      {/* Se monta solo al abrir: el estado del formulario empieza limpio cada vez */}
      {open && <BulkForm onClose={onClose} {...props} />}
    </Modal>
  )
}

function BulkForm({ staff, defaultFrom, defaultTo, onClose }: Omit<Props, 'open'>) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const { data: templates = [] } = useShiftTemplates()

  const [selected, setSelected] = useState<string[]>([])
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5])
  const [chosenShift, setShift] = useState('')
  const [replace, setReplace] = useState(false)
  const [result, setResult] = useState<BulkResult | null>(null)
  // Por defecto, la primera plantilla (puede cargar después de abrir)
  const shift = chosenShift || templates[0]?.id || ''

  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  const mutation = useMutation({
    mutationFn: async () =>
      (
        await api.post<BulkResult>('/schedules/bulk', {
          staffIds: selected,
          from,
          to,
          weekdays,
          replace,
          ...(shift === REST ? { isRestDay: true } : { templateId: shift }),
        })
      ).data,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
      setResult(data)
      if (!data.skipped.length) {
        toast.success(`${data.created} turno(s) programado(s)`)
        onClose()
      }
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const nameOf = (id: string) => {
    const s = staff.find((x) => x.id === id)
    return s ? staffFullName(s) : id
  }

  return result ? (
    <div className="space-y-4 text-sm">
      <p>
        Se programaron <strong>{result.created}</strong> turno(s). No se programaron{' '}
        <strong>{result.skipped.length}</strong>:
      </p>
      <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-3">
        {result.skipped.map((s) => (
          <li key={`${s.staffId}-${s.date}`}>
            <span className="font-medium">{nameOf(s.staffId)}</span> · {dayLabel(s.date)}:{' '}
            <span className="text-slate-600">{s.reason}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <Button onClick={onClose}>Cerrar</Button>
      </div>
    </div>
  ) : (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate()
      }}
    >
      <div>
        <div className="mb-1 flex items-center justify-between text-sm font-medium text-slate-700">
          <span>Empleados ({selected.length})</span>
          <button
            type="button"
            className="text-xs text-blue-700 hover:underline"
            onClick={() => setSelected(selected.length === staff.length ? [] : staff.map((s) => s.id))}
          >
            {selected.length === staff.length ? 'Ninguno' : 'Todos'}
          </button>
        </div>
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
          {staff.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(s.id)}
                onChange={() => setSelected(toggle(selected, s.id))}
              />
              {staffFullName(s)} <span className="text-xs text-slate-400">{s.employeeNumber}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Desde" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="Hasta" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      <div>
        <span className="text-sm font-medium text-slate-700">Días</span>
        <div className="mt-1 flex flex-wrap gap-1">
          {WEEKDAYS.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => setWeekdays(toggle(weekdays, d.value))}
              className={`rounded-md border px-3 py-1 text-sm ${
                weekdays.includes(d.value)
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-300 bg-white text-slate-600'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <Select label="Turno" value={shift} onChange={(e) => setShift(e.target.value)}>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} ({t.startTime}–{t.endTime})
          </option>
        ))}
        <option value={REST}>Día de descanso</option>
      </Select>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
        Reemplazar turnos que ya existan en esos días
      </label>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" loading={mutation.isPending} disabled={!selected.length || !weekdays.length || !shift}>
          Asignar
        </Button>
      </div>
    </form>
  )
}
