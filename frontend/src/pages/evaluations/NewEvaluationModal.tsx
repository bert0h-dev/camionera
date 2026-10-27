import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import { staffFullName, todayKey } from '../../lib/format'
import { STAFF_ROLE_LABELS, type Evaluation, type Paginated, type Staff } from '../../lib/types'
import { useAuth } from '../../auth/useAuth'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/toast-context'

/** Periodo sugerido: los últimos 6 meses hasta hoy. */
function defaultPeriod() {
  const to = todayKey()
  const [y, m] = to.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 7, 1)).toISOString().slice(0, 10)
  return { from: start, to }
}

interface Props {
  open: boolean
  onClose: () => void
  /** Empleado fijo (desde su ficha) */
  staffId?: string
}

export function NewEvaluationModal({ open, onClose, staffId }: Props) {
  return (
    <Modal open={open} title="Nueva evaluación" onClose={onClose}>
      {open && <NewEvaluationForm staffId={staffId} onClose={onClose} />}
    </Modal>
  )
}

function NewEvaluationForm({ staffId, onClose }: Omit<Props, 'open'>) {
  const toast = useToast()
  const navigate = useNavigate()
  const { user } = useAuth()
  const period = defaultPeriod()
  const [selected, setSelected] = useState(staffId ?? '')
  const [from, setFrom] = useState(period.from)
  const [to, setTo] = useState(period.to)

  const { data: staff = [] } = useQuery({
    queryKey: ['staff', 'active-all'],
    enabled: !staffId,
    queryFn: async () =>
      (await api.get<Paginated<Staff>>('/staff', { params: { activeOnly: true, limit: 100 } })).data.data,
  })
  // No se puede evaluar a uno mismo
  const options = staff.filter((s) => !s.userId || s.userId !== user?.id)

  const create = useMutation({
    mutationFn: async () =>
      (await api.post<Evaluation>('/evaluations', { staffId: selected, periodStart: from, periodEnd: to })).data,
    onSuccess: (e) => {
      toast.success('Evaluación creada')
      navigate(`/evaluaciones/${e.id}`)
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        create.mutate()
      }}
    >
      {!staffId && (
        <Select label="Empleado" value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Selecciona…</option>
          {options.map((s) => (
            <option key={s.id} value={s.id}>
              {staffFullName(s)} · {STAFF_ROLE_LABELS[s.role]}
            </option>
          ))}
        </Select>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Inicio del periodo" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="Fin del periodo" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <p className="text-xs text-slate-500">Se agregan los criterios activos que aplican al puesto del empleado.</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" loading={create.isPending} disabled={!selected || !from || !to || to < from}>
          Crear
        </Button>
      </div>
    </form>
  )
}
