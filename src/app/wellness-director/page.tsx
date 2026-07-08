import { DashboardShell } from '@/components/layout/DashboardShell'
import { getTeamDashboard } from '@/lib/supabase/queries'
import { KpiCard, Alert } from '@/components/ui'
import { AlertTriangle } from 'lucide-react'
import { WellnessDirectorClient } from './WellnessDirectorClient'

export const dynamic = 'force-dynamic'

export default async function WellnessDirectorPage() {
  const { employees, stats, interventions } = await getTeamDashboard()
  const highRisk = employees.filter(e => e.risk_level === 'High')

  // Build department intervention summary from live data
  const deptMap: Record<string, { priority: string; triggers: string[]; actions: string[] }> = {}

  interventions.forEach(i => {
    const dept = i.department ?? 'Unknown'
    if (!deptMap[dept]) {
      deptMap[dept] = { priority: 'On Track', triggers: [], actions: [] }
    }
    if (i.outcome === 'Pending') {
      deptMap[dept].priority = 'High Priority'
    } else if (i.outcome === 'In Progress' || i.outcome === 'Monitoring') {
      if (deptMap[dept].priority !== 'High Priority') {
        deptMap[dept].priority = 'Monitoring'
      }
    }
    if (i.trigger_metric && !deptMap[dept].triggers.includes(i.trigger_metric)) {
      deptMap[dept].triggers.push(i.trigger_metric)
    }
    if (i.intervention_type && !deptMap[dept].actions.includes(i.intervention_type)) {
      deptMap[dept].actions.push(i.intervention_type)
    }
  })

  const deptSuggestions = Object.entries(deptMap).sort((a, b) => {
    const order = { 'High Priority': 0, 'Monitoring': 1, 'On Track': 2 }
    return (order[a[1].priority as keyof typeof order] ?? 3) - (order[b[1].priority as keyof typeof order] ?? 3)
  })

  return (
    <DashboardShell title="Wellness Director Dashboard">
      {highRisk.length > 0 && (
        <Alert variant="warn" icon={<AlertTriangle size={14} />}>
          <strong style={{ color: '#fff' }}>{highRisk.length} employee{highRisk.length > 1 ? 's' : ''} flagged: </strong>
          {highRisk.map(e => `${e.first_name} ${e.last_name} (Recovery ${e.latest_wellness?.recovery_score ?? '–'})`).join(' · ')} — require immediate Wellness Director review.
        </Alert>
      )}
      <div className="sec-label">Workforce snapshot — {employees.length} employees</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 18 }}>
        <KpiCard label="Avg recovery score" value={stats.avg_recovery} color="#69BE28" delta="+4 pts vs May" deltaDir="up" />
        <KpiCard label="High burnout risk" value={stats.high_risk_count} color="#ff6b6b" delta={highRisk.map(e => e.first_name).join(' · ')} deltaDir="down" />
        <KpiCard label="Avg sleep performance" value={`${stats.avg_sleep_perf}%`} color="#A5ACAF" delta="+3% vs May" deltaDir="up" />
        <KpiCard label="Avg HRV" value={`${stats.avg_hrv}ms`} color="#69BE28" delta="+2ms vs May" deltaDir="up" />
      </div>

      <WellnessDirectorClient employees={employees} />

      {deptSuggestions.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div className="sec-label" style={{ marginBottom: 12 }}>Suggested interventions by department</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {deptSuggestions.map(([dept, info]) => (
              <div key={dept} style={{
                background: '#001a33',
                border: `1px solid ${info.priority === 'High Priority' ? '#ff6b6b' : info.priority === 'Monitoring' ? '#F59E0B' : '#0a3560'}`,
                borderRadius: 10,
                padding: 16,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{dept}</div>
                  <div style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, letterSpacing: 0.5,
                    background: info.priority === 'High Priority' ? '#ff6b6b22' : info.priority === 'Monitoring' ? '#F59E0B22' : '#69BE2822',
                    color: info.priority === 'High Priority' ? '#ff6b6b' : info.priority === 'Monitoring' ? '#F59E0B' : '#69BE28',
                  }}>{info.priority}</div>
                </div>
                {info.triggers.length > 0 && (
                  <div style={{ fontSize: 11, color: '#A5ACAF', marginBottom: 8 }}>
                    Triggered by: {info.triggers.join(', ')}
                  </div>
                )}
                {info.actions.map((action, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#ccc', padding: '5px 0', borderTop: i === 0 ? '1px solid #0a3560' : '1px solid #0a356066' }}>
                    → {action}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </DashboardShell>
  )
}
