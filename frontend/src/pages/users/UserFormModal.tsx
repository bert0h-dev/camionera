import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import { ROLE_LABELS, USER_ROLES, type User } from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/toast-context'

const schema = z.object({
  fullName: z.string().trim().min(2, 'Mínimo 2 caracteres'),
  email: z.email('Correo inválido'),
  role: z.enum(USER_ROLES),
  // Solo obligatoria al crear; se valida en el submit
  password: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  user: User | null // null = alta
  onClose: () => void
}

export function UserFormModal({ open, user, onClose }: Props) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const isEdit = !!user

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (open) {
      reset(user ? { fullName: user.fullName, email: user.email, role: user.role } : { role: 'viewer' })
    }
  }, [open, user, reset])

  const mutation = useMutation({
    mutationFn: async ({ password, ...values }: FormValues): Promise<void> => {
      if (isEdit) await api.patch(`/users/${user.id}`, values)
      else await api.post('/users', { ...values, password })
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Usuario actualizado' : 'Usuario creado')
      queryClient.invalidateQueries({ queryKey: ['users'] })
      onClose()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const onSubmit = (values: FormValues) => {
    if (!isEdit && (values.password?.length ?? 0) < 8) {
      setError('password', { message: 'Mínimo 8 caracteres' })
      return
    }
    mutation.mutate(values)
  }

  return (
    <Modal open={open} title={isEdit ? 'Editar usuario' : 'Nuevo usuario'} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Input label="Nombre completo" error={errors.fullName?.message} {...register('fullName')} />
        <Input label="Correo" type="email" error={errors.email?.message} {...register('email')} />
        <Select label="Rol" error={errors.role?.message} {...register('role')}>
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
        {!isEdit && (
          <Input
            label="Contraseña"
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          />
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
