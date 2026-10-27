import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { Evaluation, Paginated } from '../../lib/types'
import { useAuth } from '../../auth/useAuth'
import { ScoreValue } from '../../components/EvaluationBadges'
import { Button } from '../../components/ui/Button'
import { Table } from '../../components/ui/Table'
import { evaluationColumns } from '../evaluations/evaluationColumns'
import { NewEvaluationModal } from '../evaluations/NewEvaluationModal'

export function StaffEvaluationsTab({
  staffId,
  staffUserId,
  editable,
}: {
  staffId: string
  staffUserId: string | null
  editable: boolean
}) {
  const { user } = useAuth()
  const [creating, setCreating] = useState(false)
  const canEvaluate =
    editable &&
    (user?.role === 'admin' || user?.role === 'hr' || user?.role === 'supervisor') &&
    staffUserId !== user?.id

  const { data, isLoading } = useQuery({
    queryKey: ['evaluations', { staffId }],
    queryFn: async () =>
      (await api.get<Paginated<Evaluation>>('/evaluations', { params: { staffId, limit: 100 } })).data.data,
  })
  const rows = data ?? []
  // Tendencia: promedios de las evaluaciones cerradas, de la más antigua a la más reciente
  const trend = rows
    .filter((e) => e.status !== 'draft' && e.overallScore != null)
    .map((e) => e.overallScore!)
    .reverse()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
          {trend.length > 0 ? (
            <>
              <span>Tendencia:</span>
              {trend.map((s, i) => (
                <span key={i} className="flex items-center gap-2">
                  {i > 0 && <span className="text-fg-subtle">→</span>}
                  <ScoreValue value={s} />
                </span>
              ))}
            </>
          ) : (
            <span>Sin evaluaciones finalizadas</span>
          )}
        </div>
        {canEvaluate && <Button onClick={() => setCreating(true)}>Nueva evaluación</Button>}
      </div>

      <Table
        columns={evaluationColumns(false)}
        rows={rows}
        rowKey={(e) => e.id}
        loading={isLoading}
        emptyMessage="Sin evaluaciones"
      />

      <NewEvaluationModal open={creating} staffId={staffId} onClose={() => setCreating(false)} />
    </div>
  )
}
