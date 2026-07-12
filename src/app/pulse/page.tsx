import { DashboardShell } from '@/components/layout/DashboardShell'
import { getTeamDashboard, getLatestPulse } from '@/lib/supabase/queries'
import { KpiCard, Card, Badge, BarRow } from '@/components/ui'
import { initials, safeAvg } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function PulsePage() {
  const [{ employees }, pulse] = await Promise.all([
    getTeamDashboard(),
    getLatestPulse(),
  ])

  const pulseMap = Object.fromEntries(pulse.map((p) => [p.employee_id, p]))
  const responded = pulse.length
  const avgWellbeing = safeAvg(pulse.map((p) => p.wellbeing_score))
  const avgBurnout = safeAvg(pulse.map((p) => p.burnout_score))
  const avgPsychSafety = safeAvg(pulse.map((p) => p.psych_safety))

  const questions = [
    { label: 'I feel supported by my manager', key: 'manager_support' as const },
    { label: 'I have energy at end of my shift', key: 'energy_score' as const },
    { label: 'I feel safe raising wellbeing concerns', key: 'psych_safety' as const },
    { label: 'My workload feels manageable', key: 'workload_score' as const },
    { label: 'Work-life balance is satisfactory', key: 'work_life_balance' as const },
    { label: 'I would recommend this workplace', key: 'recommend_score' as const },
  ]

  return (
    <DashboardShell title="Pulse Survey Dashboard">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 18 }}>
        <KpiCard label="Response rate" value={`${Math.round((responded / employees.length) * 100)}%`} color="#69BE28" delta={`${responded} of ${employees.length} responded`} deltaDir="up" />
        <KpiCard label="Avg wellbeing" value={`${avgWellbeing}/10`} color="#fff" delta={responded > 0 ? 'Latest survey average' : 'No responses yet'} deltaDir="neutral" />
        <KpiCard label="Burnout index" value={`${avgBurnout}/10`} color="#ff6b6b" delta="Lower is better" deltaDir="neutral" />
        <KpiCard label="Psych safety" value={`${avgPsychSafety}/10`} color="#fff" delta={responded > 0 ? 'Latest survey average' : 'No responses yet'} deltaDir="neutral" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card title="Wellbeing scores by employee" badge={<Badge variant="wolf">{responded} responses</Badge>}>
          {[...employees]
            .filter((e) => pulseMap[e.id])
            .sort((a, b) => (pulseMap[b.id]?.wellbeing_score ?? 0) - (pulseMap[a.id]?.wellbeing_score ?? 0))
            .map((e, idx) => {
              const score = pulseMap[e.id]?.wellbeing_score ?? 0
              const color = score >= 7 ? '#69BE28' : score >= 5 ? '#FFA500' : '#ff6b6b'
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#1a4a2e', color: '#69BE28', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
                    {initials(e.first_name, e.last_name)}
                  </div>
                  <span style={{ width: 100, fontSize: 11, color: '#A5ACAF' }}>
                    {e.first_name}{e.is_exact_data ? ' ★' : ''}
                  </span>
                  <div style={{ flex: 1, height: 5, background: '#0a3560', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${score * 10}%`, height: '100%', background: color, borderRadius: 3 }} />
                  </div>
                  <span style={{ width: 24, textAlign: 'right', fontSize: 11, fontWeight: 700, color }}>{score}</span>
                </div>
              )
            })}
        </Card>

        <Card title="Question breakdown">
          {questions.map((q) => {
            const avg = safeAvg(pulse.map((p) => p[q.key]))
            const color = avg >= 7 ? '#69BE28' : avg >= 5 ? '#FFA500' : '#ff6b6b'
            return (
              <div key={q.key} style={{ padding: '8px 0', borderBottom: '1px solid #0a3560' }}>
                <div style={{ fontSize: 11, color: '#fff', marginBottom: 5 }}>{q.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 5, background: '#0a3560', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${avg * 10}%`, height: '100%', background: color, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, width: 24, color }}>{avg}</span>
                </div>
              </div>
            )
          })}
        </Card>
      </div>
    </DashboardShell>
  )
}
