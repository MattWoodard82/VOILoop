import { DashboardShell } from '@/components/layout/DashboardShell'
import { getTeamDashboard } from '@/lib/supabase/queries'
import { KpiCard, Alert } from '@/components/ui'
import { AlertTriangle } from 'lucide-react'
import { ExecutiveClient } from './ExecutiveClient'

export const revalidate = 60

export default async function ExecutivePage() {
  const { employees, stats } = await getTeamDashboard()
  const highRisk = employees.filter(e => e.risk_level === 'High')

  return (
    <DashboardShell title="Executive Dashboard">
      {highRisk.length > 0 && (
        <Alert variant="warn" icon={<AlertTriangle size={14} />}>
          <strong style={{ color: '#fff' }}>{highRisk.length} employee{highRisk.length > 1 ? 's' : ''} flagged: </strong>
          {highRisk.map(e => `${e.first_name} ${e.last_name} (Recovery ${e.latest_wellness?.recovery_score ?? '—'})`).join(' · ')} — require immediate Wellness Director review.
        </Alert>
      )}
      <div className="sec-label">Workforce snapshot — {employees.length} employees</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 18 }}>
        <KpiCard label="Avg recovery score" value={stats.avg_recovery} color="#69BE28" delta="+4 pts vs May" deltaDir="up" />
        <KpiCard label="High burnout risk" value={stats.high_risk_count} color="#ff6b6b" delta={highRisk.map(e => e.first_name).join(' · ')} deltaDir="down" />
        <KpiCard label="Avg sleep performance" value={`${stats.avg_sleep_perf}%`} color="#A5ACAF" delta="+3% vs May" deltaDir="up" />
        <KpiCard label="Avg HRV" value={`${stats.avg_hrv}ms`} color="#69BE28" delta="+2ms vs May" deltaDir="up" />
      </div>
      <ExecutiveClient employees={employees} />
    </DashboardShell>
  )
}
