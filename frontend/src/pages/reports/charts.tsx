import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMoney } from '../../lib/format'

// Paleta de la dirección D: índigo de marca, ámbar de acento y tonos de apoyo
const CHART_COLORS = ['#4f46e5', '#f59e0b', '#10b981', '#0ea5e9', '#ef4444', '#a855f7', '#64748b']

const compact = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`

const tooltipStyle = {
  contentStyle: {
    background: 'var(--color-surface, #fff)',
    border: '1px solid var(--color-border, #e5e7eb)',
    borderRadius: 8,
    fontSize: 12,
  },
}

/** Barras por día: vendido y reembolsos. */
export function DailySalesChart({ data }: { data: { date: string; gross: number; refunds: number }[] }) {
  const rows = data.map((d) => ({ ...d, label: `${d.date.slice(8)}/${d.date.slice(5, 7)}` }))
  return (
    <div className="h-72 w-full text-fg-muted">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: 'currentColor', fontSize: 11 }} tickLine={false} minTickGap={12} />
          <YAxis tickFormatter={compact} tick={{ fill: 'currentColor', fontSize: 11 }} tickLine={false} width={56} />
          <Tooltip {...tooltipStyle} formatter={(v) => formatMoney(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="gross" name="Vendido" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
          <Bar dataKey="refunds" name="Reembolsos" fill={CHART_COLORS[4]} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Dona de participación (métodos de pago, canales…). */
export function ShareDonut({ data }: { data: { name: string; value: number }[] }) {
  const rows = data.filter((d) => d.value > 0)
  return (
    <div className="h-64 w-full text-fg-muted">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
            {rows.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip {...tooltipStyle} formatter={(v) => formatMoney(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Barras horizontales para rankings (rutas, tramos). */
export function RankingBars({ data }: { data: { name: string; value: number }[] }) {
  return (
    <div className="w-full text-fg-muted" style={{ height: Math.max(160, data.length * 32 + 24) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} horizontal={false} />
          <XAxis type="number" tickFormatter={compact} tick={{ fill: 'currentColor', fontSize: 11 }} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={150}
            tick={{ fill: 'currentColor', fontSize: 11 }}
            tickLine={false}
          />
          <Tooltip {...tooltipStyle} formatter={(v) => formatMoney(Number(v))} />
          <Bar dataKey="value" name="Importe" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
