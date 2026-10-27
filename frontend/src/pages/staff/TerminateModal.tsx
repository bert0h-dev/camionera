import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import { staffFullName } from '../../lib/format'
import type { Staff } from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { Input, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/toast-context'

const schema = z.object({
  terminationDate: z.string().min(1, 'Obligatorio'),
  terminationReason: z.string().trim().min(3, 'Describe el motivo'),
})
type FormValues = z.infer<typeof schema>

export function TerminateModal({ staff, open, onClose }: { staff: Staff; open: boolean; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (open) reset({ terminationDate: new Date().toISOString().slice(0, 10), terminationReason: '' })
  }, [open, reset])

  const mutation = useMutation({
    mutationFn: (values: FormValues) => api.post(`/staff/${staff.id}/terminate`, values),
    onSuccess: () => {
      toast.success('Empleado dado de baja')
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      onClose()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  return (
    <Modal open={open} title="Dar de baja" onClose={onClose}>
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4" noValidate>
        <p className="rounded-md bg-amber-50 dark:bg-amber-500/15 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          Vas a dar de baja a <strong>{staffFullName(staff)}</strong>.
          {staff.user && ' Su acceso al sistema se desactivará.'} Esta acción no se puede deshacer desde aquí.
        </p>
        <Input
          label="Fecha de baja"
          type="date"
          error={errors.terminationDate?.message}
          {...register('terminationDate')}
        />
        <Textarea
          label="Motivo"
          rows={3}
          error={errors.terminationReason?.message}
          {...register('terminationReason')}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="danger" loading={mutation.isPending}>
            Confirmar baja
          </Button>
        </div>
      </form>
    </Modal>
  )
}
