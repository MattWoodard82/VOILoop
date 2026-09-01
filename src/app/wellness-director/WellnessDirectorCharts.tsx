'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts'

interface ChartData { name: string; value: number; color: string; label?: string }
interface Props { type: 'recovery' | 'hrv' | 'strain'; data: ChartData[]; seriesName?: string }

const TICK = { fill: '#A5ACAF', fontSize: 9, fontFamily: 'Inter' }
const GRID = '#0a3560'
const VALUE_LABEL_STYLE = { fill: '#fff', fontSize: 10, fontFamily: 'Inter' }

export function WellnessDirectorCharts({ type, data, seriesName }: Props) {
  const height = type === 'recovery' ? 210 : 130
  // Bars need a plotted number even for "no data" (rendered as an empty/zero-height
  // bar via color), but the tooltip (and the end-of-bar value label) should say so
  // explicitly rather than "0" - otherwise a genuinely missing window looks
  // identical to a real lowest score.
  const tooltipFormatter = (value: number, name: string, props: { payload?: ChartData }) =>
    [props.payload?.label ?? value, name]
  // LabelList's formatter only receives the raw value, not the source row, so
  // precompute a per-row display string (honoring the "No data" override) and
  // point LabelList at that field instead of at the plotted numeric value.
  const withDisplayValue = data.map((d) => ({
    ...d,
    displayValue: d.label ?? (type === 'hrv' ? `${d.value}ms` : `${d.value}`),
  }))

  if (type === 'recovery') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={withDisplayValue} layout="vertical" margin={{ left: 4, right: 28, top: 4, bottom: 4 }}>
          <XAxis type="number" domain={[0, 100]} tick={TICK} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={TICK} axisLine={false} tickLine={false} width={68} />
          <Tooltip
            contentStyle={{ background: '#001a33', border: '1px solid #0a3560', borderRadius: 6, fontSize: 11 }}
            labelStyle={{ color: '#fff' }}
            itemStyle={{ color: '#69BE28' }}
            formatter={tooltipFormatter}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} name={seriesName ?? 'Recovery'}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            <LabelList dataKey="displayValue" position="right" style={VALUE_LABEL_STYLE} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={withDisplayValue} margin={{ left: 0, right: 4, top: 18, bottom: 4 }}>
        <XAxis dataKey="name" tick={{ ...TICK, fontSize: 8 }} axisLine={false} tickLine={false} />
        <YAxis tick={TICK} axisLine={false} tickLine={false} width={28}
          tickFormatter={type === 'hrv' ? (v) => `${v}ms` : undefined} />
        <Tooltip
          contentStyle={{ background: '#001a33', border: '1px solid #0a3560', borderRadius: 6, fontSize: 11 }}
          labelStyle={{ color: '#fff' }}
          itemStyle={{ color: '#69BE28' }}
          formatter={tooltipFormatter}
        />
        <Bar dataKey="value" radius={[3, 3, 0, 0]} name={type === 'hrv' ? 'HRV (ms)' : 'Strain'}>
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          <LabelList dataKey="displayValue" position="top" style={VALUE_LABEL_STYLE} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
