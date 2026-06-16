'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid } from 'recharts'

const TICK = { fill: '#A5ACAF', fontSize: 9, fontFamily: 'Inter' }
const TOOLTIP_STYLE = { contentStyle: { background: '#001a33', border: '1px solid #0a3560', borderRadius: 6, fontSize: 11 }, labelStyle: { color: '#fff' } }

interface ComparisonItem { name: string; before: number; after: number }
interface TrendItem { name: string; value: number }

interface Props {
  type: 'comparison' | 'trend'
  data: ComparisonItem[] | TrendItem[]
}

export function OutcomesCharts({ type, data }: Props) {
  if (type === 'comparison') {
    const d = data as ComparisonItem[]
    const chartData = d.map((r) => ({ name: r.name.split(' ')[0], before: r.before, after: r.after }))
    return (
      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={chartData} margin={{ left: 0, right: 4, top: 4, bottom: 4 }}>
          <XAxis dataKey="name" tick={{ ...TICK, fontSize: 9 }} axisLine={false} tickLine={false} />
          <YAxis tick={TICK} axisLine={false} tickLine={false} width={28} domain={[30, 80]} />
          <Tooltip {...TOOLTIP_STYLE} />
          <Bar dataKey="before" fill="rgba(165,172,175,0.3)" radius={[3,3,0,0]} name="Before" />
          <Bar dataKey="after" fill="#69BE28" radius={[3,3,0,0]} name="After" />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  const d = data as TrendItem[]
  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={d} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
        <CartesianGrid stroke="#0a3560" strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={TICK} axisLine={false} tickLine={false} />
        <YAxis tick={TICK} axisLine={false} tickLine={false} width={28} domain={[50, 80]} />
        <Tooltip {...TOOLTIP_STYLE} />
        <Line type="monotone" dataKey="value" stroke="#69BE28" strokeWidth={2}
          dot={{ fill: '#69BE28', r: 4, strokeWidth: 2, stroke: '#002244' }}
          name="Avg recovery" />
      </LineChart>
    </ResponsiveContainer>
  )
}
