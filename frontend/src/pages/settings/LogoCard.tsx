import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ImageUp, Trash2 } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { useToast } from '../../components/ui/toast-context'

const MAX_KB = 512

interface LogoInfo {
  id: string
  fileName: string
  contentType: string
  size: number
  createdAt: string
}

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.readAsDataURL(file)
  })

/** Logo de la empresa: aparece en los boletos en PDF (y en la venta en línea). */
export function LogoCard() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  // Cambia al subir o quitar para que el <img> no use la versión en caché
  const [version, setVersion] = useState(() => Date.now())
  const { data: info, isLoading } = useQuery({
    queryKey: ['files', 'company-logo'],
    queryFn: async () => (await api.get<LogoInfo | null>('/files/company-logo/info')).data,
  })
  const done = (message: string) => {
    toast.success(message)
    setVersion(Date.now())
    queryClient.invalidateQueries({ queryKey: ['files', 'company-logo'] })
  }
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
        throw new Error('El logo debe ser PNG, JPG o WebP')
      if (file.size > MAX_KB * 1024) throw new Error(`La imagen pesa más de ${MAX_KB} KB`)
      await api.put('/files/company-logo', { fileName: file.name, dataUrl: await readAsDataUrl(file) })
    },
    onSuccess: () => done('Logo guardado'),
    onError: (err) =>
      toast.error(err instanceof Error && !('isAxiosError' in err) ? err.message : apiErrorMessage(err)),
  })
  const remove = useMutation({
    mutationFn: () => api.delete('/files/company-logo'),
    onSuccess: () => done('Logo quitado'),
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  return (
    <Card>
      <CardHeader
        title="Logo"
        description={`Aparece en los boletos en PDF. PNG o JPG de hasta ${MAX_KB} KB, de preferencia cuadrado y con fondo transparente (WebP se guarda, pero el PDF solo dibuja PNG y JPG).`}
      />
      <CardBody className="flex flex-wrap items-center gap-6">
        <div className="flex size-28 items-center justify-center rounded-xl bg-band p-3">
          {info ? (
            <img
              src={`/api/files/company-logo?v=${version}`}
              alt="Logo de la empresa"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-center text-xs text-indigo-200">{isLoading ? '…' : 'Sin logo'}</span>
          )}
        </div>
        <div className="space-y-2">
          {info && (
            <p className="text-sm text-fg-muted">
              {info.fileName} · {info.size < 1024 ? `${info.size} B` : `${Math.round(info.size / 1024)} KB`}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) upload.mutate(file)
                e.target.value = ''
              }}
            />
            <Button icon={ImageUp} loading={upload.isPending} onClick={() => input.current?.click()}>
              {info ? 'Cambiar logo' : 'Subir logo'}
            </Button>
            {info && (
              <Button variant="ghost" icon={Trash2} loading={remove.isPending} onClick={() => remove.mutate()}>
                Quitar
              </Button>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  )
}
