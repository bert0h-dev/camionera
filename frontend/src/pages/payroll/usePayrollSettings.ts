import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { PayrollSettings } from '../../lib/types'

export function usePayrollSettings() {
  return useQuery({
    queryKey: ['payroll', 'settings'],
    queryFn: async () => (await api.get<PayrollSettings>('/payroll/settings')).data,
  })
}
