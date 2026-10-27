import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import { formatDate, formatMinutes, staffFullName } from '../../lib/format'
import { STAFF_ROLE_LABELS, type EvaluationDetail } from '../../lib/types'
import { useAuth } from '../../auth/useAuth'
import { EvaluationStatusBadge, ScoreValue } from '../../components/EvaluationBadges'
import { Button } from '../../components/ui/Button'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { Textarea } from '../../components/ui/Field'
import { useToast } from '../../components/ui/toast-context'

interface ScoreDraft {
  criterionId: string
  score: number | null
  comment: string
}

/** Mismo cálculo que el backend: promedio ponderado a 2 decimales, null si falta alguno. */
function weighted(scores: ScoreDraft[], weights: Map<string, number>) {
  if (scores.length === 0 || scores.some((s) => s.score == null)) return null
  const total = scores.reduce((t, s) => t + (weights.get(s.criterionId) ?? 0), 0)
  const sum = scores.reduce((t, s) => t + (weights.get(s.criterionId) ?? 0) * s.score!, 0)
  return total ? Math.round((sum / total) * 100) / 100 : null
}

function EvaluationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading } = useQuery({
    queryKey: ['evaluations', id],
    queryFn: async () => (await api.get<EvaluationDetail>(`/evaluations/${id}`)).data,
  })

  if (isLoading) return <p className="text-slate-500">Cargando…</p>
  if (!data) return <p className="text-slate-500">Evaluación no encontrada.</p>
  return <EvaluationView key={data.id} evaluation={data} />
}

function EvaluationView({ evaluation: ev }: { evaluation: EvaluationDetail }) {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const isEvaluator = user?.role === 'admin' || user?.role === 'hr' || user?.role === 'supervisor'
  const editable = ev.status === 'draft' && isEvaluator && ev.staff.userId !== user?.id

  const [scores, setScores] = useState<ScoreDraft[]>(
    ev.scores.map((s) => ({ criterionId: s.criterionId, score: s.score, comment: s.comment ?? '' })),
  )
  const [strengths, setStrengths] = useState(ev.strengths ?? '')
  const [improvements, setImprovements] = useState(ev.improvements ?? '')
  const [comments, setComments] = useState(ev.comments ?? '')
  const [confirm, setConfirm] = useState<'finalize' | 'delete' | null>(null)

  const weights = new Map(ev.scores.map((s) => [s.criterionId, s.weight]))
  const live = weighted(scores, weights)
  const pending = scores.filter((s) => s.score == null).length

  const setScore = (criterionId: string, patch: Partial<ScoreDraft>) =>
    setScores(scores.map((s) => (s.criterionId === criterionId ? { ...s, ...patch } : s)))

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['evaluations'] })
  const payload = () => ({ scores, strengths, improvements, comments })

  const save = useMutation({
    mutationFn: () => api.patch(`/evaluations/${ev.id}`, payload()),
    onSuccess: () => {
      toast.success('Borrador guardado')
      invalidate()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const finalize = useMutation({
    mutationFn: async () => {
      await api.patch(`/evaluations/${ev.id}`, payload())
      await api.post(`/evaluations/${ev.id}/finalize`)
    },
    onSuccess: () => {
      toast.success('Evaluación finalizada')
      setConfirm(null)
      invalidate()
    },
    onError: (err) => {
      setConfirm(null)
      toast.error(apiErrorMessage(err))
    },
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/evaluations/${ev.id}`),
    onSuccess: () => {
      toast.success('Borrador eliminado')
      invalidate()
      navigate('/evaluaciones')
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const a = ev.attendance

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/evaluaciones" className="text-sm text-blue-700 hover:underline">
            ← Evaluaciones
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-800">
            <Link to={`/personal/${ev.staff.id}`} className="hover:underline">
              {staffFullName(ev.staff)}
            </Link>
          </h1>
          <p className="text-sm text-slate-600">
            {STAFF_ROLE_LABELS[ev.staff.role]} · Periodo {formatDate(ev.periodStart)} – {formatDate(ev.periodEnd)} ·
            Evaluador: {ev.evaluator.fullName}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <EvaluationStatusBadge status={ev.status} />
          <div className="text-right">
            <div className="text-xs text-slate-500">Promedio</div>
            <div className="text-2xl">
              <ScoreValue value={editable ? live : ev.overallScore} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
        <div className="space-y-4">
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {ev.scores.map((s) => {
              const draft = scores.find((d) => d.criterionId === s.criterionId)!
              return (
                <li key={s.criterionId} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-medium text-slate-800">{s.criterionName}</span>
                      <span className="ml-2 text-xs text-slate-500">peso {s.weight}</span>
                      {s.criterion.description && <p className="text-xs text-slate-500">{s.criterion.description}</p>}
                    </div>
                    <div className="flex gap-1" role="radiogroup" aria-label={s.criterionName}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={draft.score === n}
                          disabled={!editable}
                          onClick={() => setScore(s.criterionId, { score: n })}
                          className={`h-9 w-9 rounded-md border text-sm font-semibold ${
                            draft.score === n
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-slate-300 bg-white text-slate-700 enabled:hover:bg-slate-50'
                          } disabled:cursor-default`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  {editable ? (
                    <input
                      className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                      placeholder="Comentario (opcional)"
                      value={draft.comment}
                      onChange={(e) => setScore(s.criterionId, { comment: e.target.value })}
                    />
                  ) : (
                    s.comment && <p className="text-sm text-slate-600">{s.comment}</p>
                  )}
                </li>
              )
            })}
          </ul>

          {editable ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Textarea label="Fortalezas" rows={3} value={strengths} onChange={(e) => setStrengths(e.target.value)} />
              <Textarea
                label="Áreas de mejora"
                rows={3}
                value={improvements}
                onChange={(e) => setImprovements(e.target.value)}
              />
              <div className="sm:col-span-2">
                <Textarea
                  label="Comentarios generales"
                  rows={3}
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <dl className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2">
              <TextBlock label="Fortalezas" value={ev.strengths} />
              <TextBlock label="Áreas de mejora" value={ev.improvements} />
              <TextBlock label="Comentarios generales" value={ev.comments} />
              {ev.status === 'acknowledged' && (
                <TextBlock
                  label={`Comentario del empleado (enterado el ${formatDate(ev.acknowledgedAt)})`}
                  value={ev.employeeComment}
                />
              )}
            </dl>
          )}

          {editable && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirm('delete')}>
                Eliminar borrador
              </Button>
              <Button variant="secondary" loading={save.isPending} onClick={() => save.mutate()}>
                Guardar borrador
              </Button>
              <Button disabled={pending > 0} onClick={() => setConfirm('finalize')}>
                {pending > 0 ? `Faltan ${pending} criterio(s)` : 'Finalizar'}
              </Button>
            </div>
          )}
        </div>

        <aside className="h-fit space-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <h2 className="font-semibold text-slate-800">Asistencia del periodo</h2>
          <Row label="Asistencias" value={a.present + a.late} />
          <Row label="Retardos" value={`${a.late} (${formatMinutes(a.lateMinutes)})`} />
          <Row label="Medios días" value={a.halfDay} />
          <Row label="Faltas" value={a.absent} />
          <Row label="Justificadas" value={a.excused} />
          <Row label="Horas extra" value={formatMinutes(a.overtimeMinutes)} />
          <p className="pt-2 text-xs text-slate-500">Solo como referencia para calificar.</p>
        </aside>
      </div>

      <ConfirmModal
        open={confirm === 'finalize'}
        title="Finalizar evaluación"
        message="Una vez finalizada no se podrá modificar y el empleado podrá verla."
        confirmLabel="Finalizar"
        loading={finalize.isPending}
        onConfirm={() => finalize.mutate()}
        onClose={() => setConfirm(null)}
      />
      <ConfirmModal
        open={confirm === 'delete'}
        title="Eliminar borrador"
        message="Se perderán las calificaciones capturadas."
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirm(null)}
      />
    </div>
  )
}

function TextBlock({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="whitespace-pre-line text-slate-700">{value || '—'}</dd>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  )
}

export default EvaluationDetailPage
