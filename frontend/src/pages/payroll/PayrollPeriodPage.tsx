import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Download, FileSpreadsheet, FileText, Lock, RefreshCw, Trash2, Wallet } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { formatDate, formatMoney, staffFullName } from '../../lib/format'
import {
  PAYMENT_FREQUENCY_LABELS,
  STAFF_ROLE_LABELS,
  type PayrollEntry,
  type PayrollPeriodDetail,
} from '../../lib/types'
import { PayrollStatusBadge } from '../../components/PayrollStatusBadge'
import { Alert } from '../../components/ui/Alert'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { Dropdown, DropdownItem } from '../../components/ui/Dropdown'
import { EmptyState } from '../../components/ui/EmptyState'
import { HeroStat } from '../../components/ui/HeroStat'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingBlock } from '../../components/ui/Spinner'
import { Table, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/toast-context'
import { AdjustmentsModal } from './AdjustmentsModal'

type Confirm = 'close' | 'pay' | 'delete' | null

/** Descarga el archivo exportado con la sesión actual (el token va en el encabezado). */
async function download(periodId: string, format: 'csv' | 'xlsx') {
  const res = await api.get<Blob>(`/payroll/periods/${periodId}/export`, { params: { format }, responseType: 'blob' })
  const name = /filename="([^"]+)"/.exec(String(res.headers['content-disposition']))?.[1] ?? `prenomina.${format}`
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function PayrollPeriodPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [entryId, setEntryId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)

  const {
    data: p,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ['payroll', 'period', id],
    queryFn: async () => (await api.get<PayrollPeriodDetail>(`/payroll/periods/${id}`)).data,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['payroll'] })
  const action = (path: string, ok: string) => ({
    mutationFn: () => api.post(`/payroll/periods/${id}/${path}`),
    onSuccess: () => {
      toast.success(ok)
      setConfirm(null)
      invalidate()
    },
    onError: (err: unknown) => {
      setConfirm(null)
      toast.error(apiErrorMessage(err))
    },
  })
  const generate = useMutation(action('generate', 'Prenómina calculada'))
  const close = useMutation(action('close', 'Nómina cerrada'))
  const pay = useMutation(action('pay', 'Nómina marcada como pagada'))
  const remove = useMutation({
    mutationFn: () => api.delete(`/payroll/periods/${id}`),
    onSuccess: () => {
      toast.success('Periodo eliminado')
      invalidate()
      navigate('/nomina')
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })
  const exporter = useMutation({
    mutationFn: (format: 'csv' | 'xlsx') => download(id!, format),
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo exportar')),
  })

  if (isLoading) return <LoadingBlock text="Cargando nómina…" />
  if (!p)
    return (
      <Card>
        <EmptyState icon={Wallet} title="No se encontró el periodo" />
      </Card>
    )

  const draft = p.status === 'draft'
  const generated = !!p.generatedAt
  const entry = p.entries.find((e) => e.id === entryId) ?? null

  const columns: Column<PayrollEntry>[] = [
    {
      header: 'Empleado',
      cell: (e) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={staffFullName(e.staff)} size="sm" />
          <div className="min-w-0">
            <div className="truncate font-medium text-fg">{staffFullName(e.staff)}</div>
            <div className="text-xs text-fg-muted">{STAFF_ROLE_LABELS[e.staff.role]}</div>
          </div>
        </div>
      ),
    },
    {
      header: 'Diario',
      className: 'text-right',
      cell: (e) => <span className="font-data text-fg-muted">{formatMoney(e.dailySalary)}</span>,
    },
    {
      header: 'Días',
      className: 'text-right',
      cell: (e) => (
        <span className="font-data">
          {Number(e.payableDays)}
          <span className="text-fg-subtle">/{e.periodDays}</span>
        </span>
      ),
    },
    {
      header: 'Faltas',
      className: 'text-right',
      cell: (e) => {
        const n = e.absences + e.lateAbsences
        return (
          <span
            className={n ? 'font-data font-semibold text-red-600 dark:text-red-400' : 'font-data text-fg-subtle'}
            title={e.lateAbsences ? `${e.lateAbsences} por retardos` : undefined}
          >
            {n || '—'}
          </span>
        )
      },
    },
    {
      header: 'Retardos',
      className: 'text-right',
      cell: (e) => (
        <span className={e.lates ? 'font-data text-amber-600 dark:text-amber-400' : 'font-data text-fg-subtle'}>
          {e.lates || '—'}
        </span>
      ),
    },
    {
      header: 'Extras',
      className: 'text-right',
      cell: (e) =>
        Number(e.overtimeAmount) > 0 ? (
          <span className="font-data text-indigo-600 dark:text-indigo-300">{formatMoney(e.overtimeAmount)}</span>
        ) : (
          <span className="font-data text-fg-subtle">—</span>
        ),
    },
    {
      header: 'Percepciones',
      className: 'text-right',
      cell: (e) => <span className="font-data">{formatMoney(e.totalPerceptions)}</span>,
    },
    {
      header: 'Deducciones',
      className: 'text-right',
      cell: (e) => (
        <span
          className={
            Number(e.totalDeductions) ? 'font-data text-red-600 dark:text-red-400' : 'font-data text-fg-subtle'
          }
        >
          {Number(e.totalDeductions) ? `−${formatMoney(e.totalDeductions)}` : '—'}
        </span>
      ),
    },
    {
      header: 'Neto',
      className: 'text-right',
      cell: (e) => (
        <span className="font-data font-bold text-fg">
          {formatMoney(e.netPay)}
          {e.adjustments.length > 0 && (
            <span className="ml-1 align-super text-[10px] font-semibold text-primary-soft-fg" title="Con ajustes">
              {e.adjustments.length}
            </span>
          )}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {p.name}
            <PayrollStatusBadge status={p.status} />
          </span>
        }
        description={
          <>
            <Link to="/nomina" className="hover:text-white hover:underline">
              Nómina
            </Link>{' '}
            · {PAYMENT_FREQUENCY_LABELS[p.frequency]}
            {p.generatedAt && ` · calculada el ${formatDate(p.generatedAt)}`}
          </>
        }
        meta={
          <span className="font-data text-base font-bold tracking-wide text-amber-400">
            {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}
          </span>
        }
        refreshing={isFetching && !isLoading}
        actions={
          <>
            {draft && (
              <Button variant="glass" icon={Trash2} onClick={() => setConfirm('delete')}>
                Eliminar
              </Button>
            )}
            {generated && (
              <Dropdown
                trigger={({ toggle }) => (
                  <Button variant="glass" icon={Download} loading={exporter.isPending} onClick={toggle}>
                    Exportar
                  </Button>
                )}
              >
                {(closeMenu) => (
                  <>
                    <DropdownItem
                      icon={FileSpreadsheet}
                      onClick={() => {
                        closeMenu()
                        exporter.mutate('xlsx')
                      }}
                    >
                      Excel (.xlsx)
                    </DropdownItem>
                    <DropdownItem
                      icon={FileText}
                      onClick={() => {
                        closeMenu()
                        exporter.mutate('csv')
                      }}
                    >
                      CSV
                    </DropdownItem>
                  </>
                )}
              </Dropdown>
            )}
            {draft && generated && (
              <Button variant="glass" icon={Lock} onClick={() => setConfirm('close')}>
                Cerrar nómina
              </Button>
            )}
            {draft && (
              <Button variant="accent" icon={RefreshCw} loading={generate.isPending} onClick={() => generate.mutate()}>
                {generated ? 'Recalcular' : 'Calcular prenómina'}
              </Button>
            )}
            {p.status === 'closed' && (
              <Button variant="accent" icon={CheckCircle2} onClick={() => setConfirm('pay')}>
                Marcar pagada
              </Button>
            )}
          </>
        }
        stats={
          <>
            <HeroStat label="Empleados" value={p.totals.employees} hint="incluidos en el periodo" />
            <HeroStat
              label="Percepciones"
              value={formatMoney(p.totals.perceptions)}
              hint={`${formatMoney(p.totals.overtime)} en horas extra`}
            />
            <HeroStat
              label="Deducciones"
              value={formatMoney(p.totals.deductions)}
              tone={p.totals.deductions ? 'warning' : 'neutral'}
              hint="ajustes manuales"
            />
            <HeroStat label="Neto a pagar" value={formatMoney(p.totals.net)} tone="primary" hint="total del periodo" />
          </>
        }
      />

      {p.missingSalary.length > 0 && (
        <Alert tone="warning" title={`${p.missingSalary.length} empleado(s) activo(s) sin salario capturado`}>
          No entran a la prenómina hasta registrar su salario en la ficha (pestaña Nómina):{' '}
          {p.missingSalary.map((s, i) => (
            <span key={s.id}>
              {i > 0 && ', '}
              <Link to={`/personal/${s.id}`} className="font-medium underline">
                {staffFullName(s)}
              </Link>
            </span>
          ))}
          .
        </Alert>
      )}
      {draft && generated && (
        <Alert tone="info">
          Al recalcular se actualizan días, faltas y extras con las asistencias actuales; los ajustes manuales se
          conservan.
        </Alert>
      )}

      {!generated ? (
        <Card>
          <EmptyState
            icon={Wallet}
            title="Aún no se calcula la prenómina"
            description="Se toman las asistencias del periodo de cada empleado con salario vigente."
            action={
              draft && (
                <Button icon={RefreshCw} loading={generate.isPending} onClick={() => generate.mutate()}>
                  Calcular prenómina
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          <Table
            columns={columns}
            rows={p.entries}
            rowKey={(e) => e.id}
            onRowClick={(e) => setEntryId(e.id)}
            emptyIcon={Wallet}
            emptyMessage="Nadie entra en este periodo"
            emptyDescription="Revisa que los empleados tengan salario con esta periodicidad."
          />
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-band px-5 py-4 text-white">
            <span className="text-sm text-indigo-200">
              Haz clic en una fila para ver el desglose{draft && ' y agregar ajustes'}.
            </span>
            <span className="flex items-baseline gap-3">
              <span className="text-sm text-indigo-200">Neto del periodo</span>
              <span className="font-data text-2xl font-bold text-amber-400">{formatMoney(p.totals.net)}</span>
            </span>
          </div>
        </>
      )}

      <AdjustmentsModal entry={entry} editable={draft} onClose={() => setEntryId(null)} />
      <ConfirmModal
        open={confirm === 'close'}
        title="Cerrar nómina"
        message="Una vez cerrada ya no se podrá recalcular ni ajustar, y los empleados verán su recibo."
        confirmLabel="Cerrar nómina"
        loading={close.isPending}
        onConfirm={() => close.mutate()}
        onClose={() => setConfirm(null)}
      />
      <ConfirmModal
        open={confirm === 'pay'}
        title="Marcar como pagada"
        message={`Confirma que ya se pagó el neto de ${formatMoney(p.totals.net)} de este periodo.`}
        confirmLabel="Marcar pagada"
        loading={pay.isPending}
        onConfirm={() => pay.mutate()}
        onClose={() => setConfirm(null)}
      />
      <ConfirmModal
        open={confirm === 'delete'}
        title="Eliminar periodo"
        message="Se eliminará el borrador con sus líneas y ajustes."
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirm(null)}
      />
    </div>
  )
}

export default PayrollPeriodPage
