'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface ChartData { name: string; value: number; color: string }
interface Props { type: 'recovery' | 'hrv' | 'strain'; data: ChartData[] }

const TICK = { fill: '#A5ACAF', fontSize: 9, fontFamily: 'Inter' }
const GRID = '#0a3560'

export function WellnessDirectorCharts({ type, data }: Props) {
  const height = type === 'recovery' ? 210 : 130

  if (type === 'recovery') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
          <XAxis type="number" domain={[0, 100]} tick={TICK} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={TICK} axisLine={false} tickLine={false} width={68} />
          <Tooltip
            contentStyle={{ background: '#001a33', border: '1px solid #0a3560', borderRadius: 6, fontSize: 11 }}
            labelStyle={{ color: '#fff' }}
            itemStyle={{ color: '#69BE28' }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} name="Recovery">
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 0, right: 4, top: 4, bottom: 4 }}>
        <XAxis dataKey="name" tick={{ ...TICK, fontSize: 8 }} axisLine={false} tickLine={false} />
        <YAxis tick={TICK} axisLine={false} tickLine={false} width={28}
          tickFormatter={type === 'hrv' ? (v) => `${v}ms` : undefined} />
        <Tooltip
          contentStyle={{ background: '#001a33', border: '1px solid #0a3560', borderRadius: 6, fontSize: 11 }}
          labelStyle={{ color: '#fff' }}
          itemStyle={{ color: '#69BE28' }}
        />
        <Bar dataKey="value" radius={[3, 3, 0, 0]} name={type === 'hrv' ? 'HRV (ms)' : 'Strain'}>
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
