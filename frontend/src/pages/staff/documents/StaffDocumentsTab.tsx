import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../../lib/api'
import { daysLabel, formatDate } from '../../../lib/format'
import {
  CERTIFICATION_TYPE_LABELS,
  type StaffCertification,
  type StaffLicense,
} from '../../../lib/types'
import { DocumentStatusBadge } from '../../../components/DocumentStatusBadge'
import { Button } from '../../../components/ui/Button'
import { ConfirmModal } from '../../../components/ui/ConfirmModal'
import { Table, type Column } from '../../../components/ui/Table'
import { useToast } from '../../../components/ui/toast-context'
import { CertificationFormModal } from './CertificationFormModal'
import { LicenseFormModal } from './LicenseFormModal'

type Editing<T> = T | null | undefined // undefined = cerrado, null = alta

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-slate-800">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

const expiryCell = (doc: { expiryDate: string | null; daysToExpiry: number | null }) => (
  <div>
    <div>{formatDate(doc.expiryDate)}</div>
    <div className="text-xs text-slate-500">{daysLabel(doc.daysToExpiry)}</div>
  </div>
)

export function StaffDocumentsTab({ staffId, canEdit }: { staffId: string; canEdit: boolean }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [license, setLicense] = useState<Editing<StaffLicense>>(undefined)
  const [certification, setCertification] = useState<Editing<StaffCertification>>(undefined)
  const [toDelete, setToDelete] = useState<{ kind: 'licenses' | 'certifications'; id: string; label: string } | null>(
    null,
  )

  const licenses = useQuery({
    queryKey: ['staff', staffId, 'licenses'],
    queryFn: async () => (await api.get<StaffLicense[]>(`/staff/${staffId}/licenses`)).data,
  })
  const certifications = useQuery({
    queryKey: ['staff', staffId, 'certifications'],
    queryFn: async () => (await api.get<StaffCertification[]>(`/staff/${staffId}/certifications`)).data,
  })

  const remove = useMutation({
    mutationFn: (d: NonNullable<typeof toDelete>) => api.delete(`/staff/${d.kind}/${d.id}`),
    onSuccess: () => {
      toast.success('Documento eliminado')
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      setToDelete(null)
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const actions = <T extends { id: string }>(doc: T, onEdit: () => void, kind: 'licenses' | 'certifications', label: string) =>
    canEdit && (
      <div className="flex justify-end gap-1">
        <Button variant="ghost" onClick={onEdit}>
          Editar
        </Button>
        <Button variant="ghost" onClick={() => setToDelete({ kind, id: doc.id, label })}>
          Eliminar
        </Button>
      </div>
    )

  const licenseColumns: Column<StaffLicense>[] = [
    { header: 'Tipo', cell: (l) => <span className="font-semibold">Tipo {l.licenseType}</span> },
    { header: 'Número', cell: (l) => <span className="font-mono text-xs">{l.licenseNumber}</span> },
    { header: 'Expedida por', cell: (l) => l.issuer },
    { header: 'Expedición', cell: (l) => formatDate(l.issueDate) },
    { header: 'Vencimiento', cell: expiryCell },
    { header: 'Estado', cell: (l) => <DocumentStatusBadge status={l.status} /> },
    {
      header: '',
      className: 'text-right',
      cell: (l) => actions(l, () => setLicense(l), 'licenses', `la licencia ${l.licenseNumber}`),
    },
  ]

  const certificationColumns: Column<StaffCertification>[] = [
    {
      header: 'Certificación',
      cell: (c) => (
        <div>
          <div className="font-medium">{c.name}</div>
          <div className="text-xs text-slate-500">{CERTIFICATION_TYPE_LABELS[c.type]}</div>
        </div>
      ),
    },
    { header: 'Expedido por', cell: (c) => c.issuer ?? '—' },
    { header: 'Folio', cell: (c) => c.certificateNumber ?? '—' },
    { header: 'Expedición', cell: (c) => formatDate(c.issueDate) },
    { header: 'Vencimiento', cell: expiryCell },
    { header: 'Estado', cell: (c) => <DocumentStatusBadge status={c.status} /> },
    {
      header: '',
      className: 'text-right',
      cell: (c) => actions(c, () => setCertification(c), 'certifications', `"${c.name}"`),
    },
  ]

  return (
    <div className="space-y-8">
      <Section
        title="Licencias de conducir"
        action={canEdit && <Button onClick={() => setLicense(null)}>Agregar licencia</Button>}
      >
        <Table
          columns={licenseColumns}
          rows={licenses.data ?? []}
          rowKey={(l) => l.id}
          loading={licenses.isLoading}
          emptyMessage="Sin licencias registradas"
        />
      </Section>

      <Section
        title="Certificaciones y exámenes"
        action={canEdit && <Button onClick={() => setCertification(null)}>Agregar certificación</Button>}
      >
        <Table
          columns={certificationColumns}
          rows={certifications.data ?? []}
          rowKey={(c) => c.id}
          loading={certifications.isLoading}
          emptyMessage="Sin certificaciones registradas"
        />
      </Section>

      <LicenseFormModal
        staffId={staffId}
        license={license ?? null}
        open={license !== undefined}
        onClose={() => setLicense(undefined)}
      />
      <CertificationFormModal
        staffId={staffId}
        certification={certification ?? null}
        open={certification !== undefined}
        onClose={() => setCertification(undefined)}
      />
      <ConfirmModal
        open={!!toDelete}
        title="Eliminar documento"
        message={`¿Eliminar ${toDelete?.label}? Usa esto solo para corregir capturas erróneas; para una renovación agrega un documento nuevo.`}
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onClose={() => setToDelete(null)}
      />
    </div>
  )
}
