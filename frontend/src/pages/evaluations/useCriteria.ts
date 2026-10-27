import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { EvaluationCriterion } from '../../lib/types'

export function useCriteria(includeInactive = false) {
  return useQuery({
    queryKey: ['evaluation-criteria', { includeInactive }],
    queryFn: async () =>
      (
        await api.get<EvaluationCriterion[]>('/evaluation-criteria', {
          params: { includeInactive: includeInactive || undefined },
        })
      ).data,
  })
}
