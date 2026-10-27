import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import { dayLabel, formatTime } from '../../lib/format'
import type { Attendance } from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { Input, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/toast-context'

export interface AttendanceTarget {
  staffId: string
  staffName: string
  date: string
  attendance: Attendance | null
}

export function AttendanceModal({ target, onClose }: { target: AttendanceTarget | null; onClose: () => void }) {
  return (
    <Modal
      open={!!target}
      title={target ? `${target.attendance ? 'Corregir' : 'Registrar'} asistencia · ${target.staffName}` : ''}
      onClose={onClose}
    >
      {target && <AttendanceForm key={`${target.staffId}|${target.date}`} target={target} onClose={onClose} />}
    </Modal>
  )
}

function AttendanceForm({ target, onClose }: { target: AttendanceTarget; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const current = target.attendance
  const isEdit = !!current

  const [checkIn, setCheckIn] = useState(formatTime(current?.checkInAt))
  const [checkOut, setCheckOut] = useState(formatTime(current?.checkOutAt))
  const [excused, setExcused] = useState(current?.status === 'excused')
  const [notes, setNotes] = useState('')

  const mutation = useMutation({
    mutationFn: async () => {
      const times = excused
        ? { excused: true }
        : { excused: false, checkInTime: checkIn || null, checkOutTime: checkOut || null }
      if (isEdit) await api.patch(`/attendance/${current.id}`, { ...times, notes })
      else await api.post('/attendance', { ...times, staffId: target.staffId, date: target.date, notes })
    },
    onSuccess: () => {
      toast.success('Asistencia guardada')
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      onClose()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const notesRequired = isEdit && notes.trim().length < 3

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate()
      }}
    >
      <p className="text-sm text-fg-muted">Día del turno: {dayLabel(target.date)}</p>

      <label className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" checked={excused} onChange={(e) => setExcused(e.target.checked)} />
        Falta justificada (permiso, vacaciones, incapacidad)
      </label>

      {!excused && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Entrada" type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
          <Input
            label="Salida (si es menor, del día siguiente)"
            type="time"
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
          />
          <p className="text-xs text-fg-muted sm:col-span-2">Sin entrada = falta.</p>
        </div>
      )}

      <Textarea
        label={isEdit ? 'Motivo de la corrección *' : 'Notas'}
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        error={isEdit && notes && notesRequired ? 'Mínimo 3 caracteres' : undefined}
      />
      {current?.notes && (
        <div className="rounded-md bg-surface-muted p-2 text-xs whitespace-pre-line text-fg-muted">
          <strong>Historial:</strong>
          {'\n'}
          {current.notes}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" loading={mutation.isPending} disabled={notesRequired}>
          Guardar
        </Button>
      </div>
    </form>
  )
}
