import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import { useAuth } from '../../auth/useAuth'
import { ROLE_LABELS, SUGGESTED_USER_ROLE, USER_ROLES, type Staff } from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/toast-context'

const schema = z.object({
  email: z.email('Correo inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  role: z.enum(USER_ROLES).optional(),
})
type FormValues = z.infer<typeof schema>

export function GrantAccessModal({ staff, open, onClose }: { staff: Staff; open: boolean; onClose: () => void }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const suggested = SUGGESTED_USER_ROLE[staff.role]
  const toast = useToast()
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (open) reset({ email: staff.email ?? '', password: '', role: suggested })
  }, [open, staff, suggested, reset])

  const mutation = useMutation({
    // RRHH no elige rol: el backend aplica el sugerido
    mutationFn: ({ role, ...values }: FormValues) =>
      api.post(`/staff/${staff.id}/credentials`, isAdmin ? { ...values, role } : values),
    onSuccess: () => {
      toast.success('Acceso al sistema creado')
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      onClose()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  return (
    <Modal open={open} title="Dar acceso al sistema" onClose={onClose}>
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4" noValidate>
        <Input label="Correo de inicio de sesión" type="email" error={errors.email?.message} {...register('email')} />
        <Input
          label="Contraseña inicial"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Select label="Rol en el sistema" error={errors.role?.message} {...register('role', { disabled: !isAdmin })}>
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
              {r === suggested ? ' (sugerido)' : ''}
            </option>
          ))}
        </Select>
        {!isAdmin && (
          <p className="text-xs text-fg-muted">Solo un administrador puede asignar un rol distinto al sugerido.</p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Crear acceso
          </Button>
        </div>
      </form>
    </Modal>
  )
}
