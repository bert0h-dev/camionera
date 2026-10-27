import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { api, apiErrorMessage } from '../../lib/api'
import { formatDate } from '../../lib/format'
import type { EvaluationDetail } from '../../lib/types'
import { EvaluationStatusBadge, ScoreValue } from '../../components/EvaluationBadges'
import { Button } from '../../components/ui/Button'
import { Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/toast-context'

type MyEvaluation = Omit<EvaluationDetail, 'attendance'>

/** Evaluaciones finalizadas del propio empleado. Solo aparece si el usuario está ligado a un empleado. */
export function MyEvaluationsCard() {
  const [open, setOpen] = useState<MyEvaluation | null>(null)
  const { data, error } = useQuery({
    queryKey: ['evaluations', 'me'],
    queryFn: async () => (await api.get<MyEvaluation[]>('/evaluations/me')).data,
    retry: false,
  })

  if ((error as AxiosError | null)?.response?.status === 404) return null
  if (!data || data.length === 0) return null
  const unread = data.filter((e) => e.status === 'finalized').length

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <h2 className="font-semibold text-fg">Mis evaluaciones</h2>
      {unread > 0 && (
        <p className="mt-1 rounded-md bg-primary-soft px-3 py-2 text-sm text-link">
          Tienes {unread === 1 ? 'una evaluación nueva' : `${unread} evaluaciones nuevas`}.
        </p>
      )}
      <ul className="mt-3 divide-y divide-border text-sm">
        {data.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-2 py-2">
            <span>
              {formatDate(e.periodStart)} – {formatDate(e.periodEnd)}
            </span>
            <span className="flex items-center gap-3">
              <ScoreValue value={e.overallScore} />
              <EvaluationStatusBadge status={e.status} />
              <Button variant="ghost" onClick={() => setOpen(e)}>
                Ver
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <Modal open={!!open} title="Mi evaluación" onClose={() => setOpen(null)}>
        {open && <MyEvaluationView key={open.id} evaluation={open} onClose={() => setOpen(null)} />}
      </Modal>
    </section>
  )
}

function MyEvaluationView({ evaluation: e, onClose }: { evaluation: MyEvaluation; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [comment, setComment] = useState('')

  const ack = useMutation({
    mutationFn: () => api.post(`/evaluations/me/${e.id}/acknowledge`, { employeeComment: comment }),
    onSuccess: () => {
      toast.success('Evaluación marcada como enterado')
      queryClient.invalidateQueries({ queryKey: ['evaluations'] })
      onClose()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  return (
    <div className="space-y-4 text-sm">
      <p className="text-fg-muted">
        Periodo {formatDate(e.periodStart)} – {formatDate(e.periodEnd)} · Evaluador: {e.evaluator.fullName} · Promedio{' '}
        <ScoreValue value={e.overallScore} />
      </p>
      <ul className="divide-y divide-border rounded-md border border-border">
        {e.scores.map((s) => (
          <li key={s.criterionId} className="px-3 py-2">
            <div className="flex justify-between">
              <span className="font-medium text-fg">{s.criterionName}</span>
              <span className="font-semibold">{s.score} / 5</span>
            </div>
            {s.comment && <p className="text-fg-muted">{s.comment}</p>}
          </li>
        ))}
      </ul>
      {e.strengths && (
        <p>
          <strong>Fortalezas:</strong> {e.strengths}
        </p>
      )}
      {e.improvements && (
        <p>
          <strong>Áreas de mejora:</strong> {e.improvements}
        </p>
      )}
      {e.comments && (
        <p>
          <strong>Comentarios:</strong> {e.comments}
        </p>
      )}

      {e.status === 'finalized' ? (
        <>
          <Textarea
            label="Tu comentario (opcional)"
            rows={2}
            value={comment}
            onChange={(ev) => setComment(ev.target.value)}
          />
          <div className="flex justify-end">
            <Button loading={ack.isPending} onClick={() => ack.mutate()}>
              Enterado
            </Button>
          </div>
        </>
      ) : (
        e.employeeComment && (
          <p className="text-fg-muted">
            <strong>Tu comentario:</strong> {e.employeeComment}
          </p>
        )
      )}
    </div>
  )
}
