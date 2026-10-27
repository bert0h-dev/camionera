import { Link } from 'react-router-dom'
import { formatDate, staffFullName } from '../../lib/format'
import { STAFF_ROLE_LABELS, type Evaluation } from '../../lib/types'
import { EvaluationStatusBadge, ScoreValue } from '../../components/EvaluationBadges'
import type { Column } from '../../components/ui/Table'

export const evaluationColumns = (withStaff: boolean): Column<Evaluation>[] => [
  ...(withStaff
    ? [
        {
          header: 'Empleado',
          cell: (e: Evaluation) => (
            <div>
              <div className="font-medium text-slate-800">{staffFullName(e.staff)}</div>
              <div className="text-xs text-slate-500">{STAFF_ROLE_LABELS[e.staff.role]}</div>
            </div>
          ),
        },
      ]
    : []),
  { header: 'Periodo', cell: (e) => `${formatDate(e.periodStart)} – ${formatDate(e.periodEnd)}` },
  { header: 'Evaluador', cell: (e) => e.evaluator.fullName },
  { header: 'Promedio', cell: (e) => <ScoreValue value={e.overallScore} /> },
  { header: 'Estado', cell: (e) => <EvaluationStatusBadge status={e.status} /> },
  {
    header: '',
    className: 'text-right',
    cell: (e) => (
      <Link to={`/evaluaciones/${e.id}`} className="text-sm font-medium text-blue-700 hover:underline">
        {e.status === 'draft' ? 'Continuar' : 'Ver'}
      </Link>
    ),
  },
]
