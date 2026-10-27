import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

type Health = { status: string; timestamp: string }

function HomePage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['health'],
    queryFn: async () => (await api.get<Health>('/health')).data,
  })

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-4 text-slate-800">
      <h1 className="text-3xl font-bold">Central Camionera</h1>
      <p className="text-sm">
        API:{' '}
        {isLoading && <span className="text-slate-500">verificando…</span>}
        {isError && <span className="font-semibold text-red-600">sin conexión</span>}
        {data && <span className="font-semibold text-green-600">{data.status}</span>}
      </p>
    </main>
  )
}

export default HomePage
