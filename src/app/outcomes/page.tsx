import { DashboardShell } from '@/components/layout/DashboardShell'
import { getTeamDashboard, getTeamWellnessTrend } from '@/lib/supabase/queries'
import { KpiCard, Card, Badge, Alert } from '@/components/ui'
import { Check } from 'lucide-react'
import { OutcomesCharts } from './OutcomesCharts'

export const revalidate = 60

// Resolved interventions with before/after data
const RESOLVED = [
  { name: 'Caleb Stone', before: 52, after: 66, metric: 'Recovery Score' },
  { name: 'Kyle Schuppan', before: 55, after: 71, metric: 'Recovery Score' },
  { name: 'Frank Anderson', before: 38, after: 59, metric: 'Recovery Score' },
  { name: 'Charlie Davis', before: 44, after: 63, metric: 'Recovery Score' },
]

const LOOP_STEPS = [
  { step: '01 · Insight', title: '2 employees flagged', desc: 'Blambic & Stephenson below recovery threshold', active: true },
  { step: '02 · Action', title: 'Interventions deployed', desc: '1:1 check-in + sleep hygiene campaign assigned', active: false },
  { step: '03 · Validate', title: 'Track at week 4', desc: 'Wearable data + pulse re-survey to confirm change', active: false },
  { step: '04 · Optimize', title: 'Scale what worked', desc: 'Expand to full department if validated', active: false },
]

export default async function OutcomesPage() {
  const [{ employees, stats }, trend] = await Promise.all([
    getTeamDashboard(),
    getTeamWellnessTrend(5),
  ])

  const travis = employees.find((e) => e.is_exact_data)
  const avgResolved = Math.round(
    RESOLVED.reduce((sum, r) => sum + Math.round(((r.after - r.before) / r.before) * 100), 0) / RESOLVED.length
  )

  return (
    <DashboardShell title="Outcomes Validation">
      <Alert variant="good" icon={<Check size={14} />}>
        <strong style={{ color: '#fff' }}>Travis Brandenburgh (COO) baseline locked.</strong>{' '}
        Recovery {travis?.latest_wellness?.recovery_score ?? 72} · HRV {travis?.latest_wellness?.hrv_ms ?? 37}ms · Sleep {travis?.latest_wellness?.sleep_perf ?? 89}% · Strain {travis?.latest_wellness?.day_strain ?? 10.4} — team benchmark for all intervention comparisons.
      </Alert>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 18 }}>
        <KpiCard label="Team avg recovery" value={stats.avg_recovery} color="#69BE28" delta={`COO benchmark: ${travis?.latest_wellness?.recovery_score ?? 72}`} deltaDir="neutral" />
        <KpiCard label="Gap vs benchmark" value={`–${(travis?.latest_wellness?.recovery_score ?? 72) - stats.avg_recovery} pts`} color="#ff6b6b" delta="2 employees below 50" deltaDir="down" />
        <KpiCard label="Resolved interventions" value={RESOLVED.length} color="#69BE28" delta={`Avg +${avgResolved}% improvement`} deltaDir="up" />
        <KpiCard label="Est. cost avoided" value="$82K" color="#69BE28" delta="Absenteeism + turnover" deltaDir="up" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* Before/after table */}
        <Card title="Before vs after — validated interventions" badge={<Badge variant="green">{RESOLVED.length} validated</Badge>}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th style={{ textAlign: 'center' }}>Before</th>
                <th style={{ textAlign: 'center' }}>After</th>
                <th style={{ textAlign: 'right' }}>Change</th>
              </tr>
            </thead>
            <tbody>
              {RESOLVED.map((r) => {
                const delta = Math.round(((r.after - r.before) / r.before) * 100)
                return (
                  <tr key={r.name}>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td style={{ textAlign: 'center', color: '#A5ACAF' }}>{r.before}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: '#69BE28' }}>{r.after}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#69BE28' }}>+{delta}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Before/after bar chart */}
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #0a3560' }}>
            <OutcomesCharts type="comparison" data={RESOLVED} />
          </div>
        </Card>

        {/* Trend + loop */}
        <Card title="Team recovery trend">
          <OutcomesCharts
            type="trend"
            data={trend.map((t) => ({
              name: t.month.slice(5), // MM
              value: t.avg_recovery,
            }))}
          />

          {/* VOILoop cycle */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 14 }}>
            {LOOP_STEPS.map((s) => (
              <div key={s.step} style={{
                background: s.active ? 'rgba(105,190,40,0.1)' : '#001a33',
                border: `1px solid ${s.active ? 'rgba(105,190,40,0.4)' : '#0a3560'}`,
                borderRadius: 8, padding: 12,
              }}>
                <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#69BE28', marginBottom: 5, fontWeight: 700 }}>
                  {s.step}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#fff', marginBottom: 3 }}>{s.title}</div>
                <div style={{ fontSize: 10, color: '#A5ACAF', lineHeight: 1.4 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </DashboardShell>
  )
}
Update resolved employee names
