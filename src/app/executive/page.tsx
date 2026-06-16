import { DashboardShell } from '@/components/layout/DashboardShell'
import { getTeamDashboard, getTeamWellnessTrend } from '@/lib/supabase/queries'
import { KpiCard, Card, Badge, Alert, BarRow, ScorePill } from '@/components/ui'
import { recoveryColor, initials } from '@/lib/utils'
import { AlertTriangle } from 'lucide-react'
import { ExecutiveCharts } from './ExecutiveCharts'

export const revalidate = 60 // refresh every minute

export default async function ExecutivePage() {
  const [{ employees, stats }, trend] = await Promise.all([
    getTeamDashboard(),
    getTeamWellnessTrend(5),
  ])

  const highRisk = employees.filter((e) => e.risk_level === 'High')
  const highDebt = employees.filter((e) => (e.latest_wellness?.sleep_debt ?? 0) > 0.8)
    .sort((a, b) => (b.latest_wellness?.sleep_debt ?? 0) - (a.latest_wellness?.sleep_debt ?? 0))

  return (
    <DashboardShell title="Executive Dashboard">
      {highRisk.length > 0 && (
        <Alert variant="warn" icon={<AlertTriangle size={14} />}>
          <strong style={{ color: '#fff' }}>{highRisk.length} employee{highRisk.length > 1 ? 's' : ''} flagged: </strong>
          {highRisk.map((e) => `${e.first_name} ${e.last_name} (Recovery ${e.latest_wellness?.recovery_score ?? '—'})`).join(' · ')} — require immediate Wellness Director review.
        </Alert>
      )}

      <div className="sec-label">Workforce snapshot — {employees.length} employees</div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 18 }}>
        <KpiCard label="Avg recovery score" value={stats.avg_recovery} color="#69BE28" delta="+4 pts vs May" deltaDir="up" />
        <KpiCard label="High burnout risk" value={stats.high_risk_count} color="#ff6b6b" delta={highRisk.map(e => e.first_name).join(' · ')} deltaDir="down" />
        <KpiCard label="Avg sleep performance" value={`${stats.avg_sleep_perf}%`} color="#A5ACAF" delta="+3% vs May" deltaDir="up" />
        <KpiCard label="Avg HRV" value={`${stats.avg_hrv}ms`} color="#69BE28" delta="+2ms vs May" deltaDir="up" />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14, marginBottom: 14 }}>
        <Card title="Recovery scores — all employees" badge={<Badge variant="wolf">June 9 2026</Badge>}>
          <ExecutiveCharts
            type="recovery"
            data={employees.map(e => ({
              name: e.first_name + (e.is_exact_data ? ' ★' : ''),
              value: e.latest_wellness?.recovery_score ?? 0,
              color: recoveryColor(e.latest_wellness?.recovery_score ?? null),
            }))}
          />
        </Card>
        <Card title="Risk by employee">
          {employees.map((e) => (
            <BarRow
              key={e.id}
              label={e.first_name + (e.is_exact_data ? ' ★' : '')}
              value={e.latest_wellness?.recovery_score ?? 0}
              color={recoveryColor(e.latest_wellness?.recovery_score ?? null)}
            />
          ))}
        </Card>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <Card title="HRV (ms)">
          <ExecutiveCharts
            type="hrv"
            data={employees.map(e => ({
              name: e.first_name,
              value: e.latest_wellness?.hrv_ms ?? 0,
              color: e.is_exact_data ? '#69BE28' : '#A5ACAF',
            }))}
          />
        </Card>
        <Card title="Day strain">
          <ExecutiveCharts
            type="strain"
            data={employees.map(e => ({
              name: e.first_name,
              value: e.latest_wellness?.day_strain ?? 0,
              color: (e.latest_wellness?.day_strain ?? 0) > 14 ? '#ff6b6b' : (e.latest_wellness?.day_strain ?? 0) > 10 ? '#FFA500' : '#69BE28',
            }))}
          />
        </Card>
        <Card title="Sleep debt flags">
          {employees
            .sort((a, b) => (b.latest_wellness?.sleep_debt ?? 0) - (a.latest_wellness?.sleep_debt ?? 0))
            .map((e) => {
              const debt = e.latest_wellness?.sleep_debt ?? 0
              return (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #0a3560', fontSize: 11 }}>
                  <span style={{ color: '#A5ACAF' }}>{e.first_name}{e.is_exact_data ? ' ★' : ''}</span>
                  <Badge variant={debt > 1.5 ? 'red' : debt > 0.8 ? 'amber' : 'green'}>
                    {debt === 0 ? 'On target' : `${debt}hrs`}
                  </Badge>
                </div>
              )
            })}
        </Card>
      </div>
    </DashboardShell>
  )
}
