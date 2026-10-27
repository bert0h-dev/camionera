import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import {
  EVALUATION_STATUS_LABELS,
  EVALUATION_STATUSES,
  type Evaluation,
  type EvaluationStatus,
  type Paginated,
} from '../../lib/types'
import { useAuth } from '../../auth/useAuth'
import { ListChecks, Plus, Search, Star } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { FilterBar } from '../../components/ui/FilterBar'
import { PageHeader } from '../../components/ui/PageHeader'
import { Input, Select } from '../../components/ui/Field'
import { Pagination, Table } from '../../components/ui/Table'
import { evaluationColumns } from './evaluationColumns'
import { CriteriaModal } from './CriteriaModal'
import { NewEvaluationModal } from './NewEvaluationModal'

function EvaluationsPage() {
  const { user } = useAuth()
  const canEvaluate = user?.role === 'admin' || user?.role === 'hr' || user?.role === 'supervisor'
  const canManageCriteria = user?.role === 'admin' || user?.role === 'hr'

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<EvaluationStatus | ''>('')
  const [creating, setCreating] = useState(false)
  const [criteriaOpen, setCriteriaOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['evaluations', { page, search, status }],
    queryFn: async () =>
      (
        await api.get<Paginated<Evaluation>>('/evaluations', {
          params: { page, search: search || undefined, status: status || undefined },
        })
      ).data,
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Evaluaciones"
        description="Desempeño del personal por periodo, con criterios ponderados por puesto"
        actions={
          <>
            {canManageCriteria && (
              <Button variant="secondary" icon={ListChecks} onClick={() => setCriteriaOpen(true)}>
                Criterios
              </Button>
            )}
            {canEvaluate && (
              <Button icon={Plus} onClick={() => setCreating(true)}>
                Nueva evaluación
              </Button>
            )}
          </>
        }
      />

      <FilterBar>
        <div className="min-w-60 flex-1">
          <Input
            icon={Search}
            placeholder="Buscar empleado…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <div className="w-full sm:w-48">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as EvaluationStatus | '')
              setPage(1)
            }}
          >
            <option value="">Todos los estados</option>
            {EVALUATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {EVALUATION_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
      </FilterBar>

      <Table
        columns={evaluationColumns(true)}
        rows={data?.data ?? []}
        rowKey={(e) => e.id}
        loading={isLoading}
        emptyIcon={Star}
        emptyMessage="Sin evaluaciones"
        emptyDescription="Crea una evaluación para medir el desempeño de un empleado en un periodo."
      />
      {data && <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />}

      <NewEvaluationModal open={creating} onClose={() => setCreating(false)} />
      <CriteriaModal open={criteriaOpen} onClose={() => setCriteriaOpen(false)} />
    </div>
  )
}

export default EvaluationsPage
