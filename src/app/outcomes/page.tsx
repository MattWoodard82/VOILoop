import { DashboardShell } from '@/components/layout/DashboardShell'
import { getTeamDashboard, getTeamWellnessTrend } from '@/lib/supabase/queries'
import { KpiCard, Card, Badge, Alert } from '@/components/ui'
import { Check } from 'lucide-react'
import { OutcomesCharts } from './OutcomesCharts'

export const dynamic = 'force-dynamic'

export default async function OutcomesPage() {
  const [{ participants, stats, interventions }, trend] = await Promise.all([
    getTeamDashboard(),
    getTeamWellnessTrend(5),
  ])

  const benchmark = participants.find((e) => e.is_exact_data)
  const participantMap = Object.fromEntries(participants.map((e) => [e.id, e]))
  const pending = interventions.filter((i) => i.outcome === 'Pending')
  const inProgress = interventions.filter((i) => i.outcome === 'In Progress')
  const monitoring = interventions.filter((i) => i.outcome === 'Monitoring')
  const resolved = interventions.filter((i) => i.outcome === 'Resolved')
  const openInterventions = pending.length + inProgress.length + monitoring.length
  const highRisk = participants.filter((e) => e.risk_level === 'High')

  return (
    <DashboardShell title="Outcomes Validation">
      <Alert variant="good" icon={<Check size={14} />}>
        {benchmark ? (
          <>
            <strong style={{ color: '#fff' }}>
              {benchmark.first_name} {benchmark.last_name} baseline profile available.
            </strong>{' '}
            Recovery {benchmark.latest_wellness?.recovery_score ?? '—'} · HRV {benchmark.latest_wellness?.hrv_ms ?? '—'}ms ·
            Sleep {benchmark.latest_wellness?.sleep_perf ?? '—'}% · Strain {benchmark.latest_wellness?.day_strain ?? '—'}.
          </>
        ) : (
          <>
            <strong style={{ color: '#fff' }}>No benchmark profile is flagged.</strong>{' '}
            Outcomes are shown from current team-wide biometric and intervention data.
          </>
        )}
      </Alert>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 18 }}>
        <KpiCard label="Team avg recovery" value={stats.avg_recovery} color="#69BE28" delta={`${stats.total_participants} active participants`} deltaDir="neutral" />
        <KpiCard label="High risk participants" value={stats.high_risk_count} color="#ff6b6b" delta={highRisk.length > 0 ? highRisk.map((e) => e.first_name).join(' · ') : 'No high-risk participants'} deltaDir="neutral" />
        <KpiCard label="Open interventions" value={openInterventions} color="#FFA500" delta={`Pending ${pending.length} · In progress ${inProgress.length} · Monitoring ${monitoring.length}`} deltaDir="neutral" />
        <KpiCard label="Resolved interventions" value={resolved.length} color="#69BE28" delta={`${interventions.length} total intervention records`} deltaDir="neutral" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card title="Intervention outcome distribution" badge={<Badge variant="wolf">{interventions.length} total</Badge>}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Count</th>
                <th style={{ textAlign: 'right' }}>Share</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Pending', count: pending.length },
                { label: 'In Progress', count: inProgress.length },
                { label: 'Monitoring', count: monitoring.length },
                { label: 'Resolved', count: resolved.length },
              ].map((item) => (
                <tr key={item.label}>
                  <td style={{ fontWeight: 600 }}>{item.label}</td>
                  <td style={{ textAlign: 'right', color: '#fff' }}>{item.count}</td>
                  <td style={{ textAlign: 'right', color: '#A5ACAF' }}>
                    {interventions.length > 0 ? `${Math.round((item.count / interventions.length) * 100)}%` : '0%'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Team recovery trend">
          <OutcomesCharts
            type="trend"
            data={trend.map((t) => ({
              name: t.month.slice(5), // MM
              value: t.avg_recovery,
            }))}
          />
        </Card>
      </div>

      <div style={{ marginTop: 14 }}>
        <Card title="Recently resolved interventions" badge={<Badge variant="green">{resolved.length} resolved</Badge>}>
          {resolved.length === 0 ? (
            <div style={{ fontSize: 12, color: '#A5ACAF' }}>No resolved interventions yet.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Participant</th>
                  <th>Department</th>
                  <th>Trigger</th>
                  <th>Intervention</th>
                  <th style={{ textAlign: 'right' }}>Resolved date</th>
                </tr>
              </thead>
              <tbody>
                {resolved.slice(0, 10).map((entry) => {
                  const participant = participantMap[entry.participant_id]
                  return (
                    <tr key={entry.id}>
                      <td style={{ fontWeight: 600 }}>{participant ? `${participant.first_name} ${participant.last_name}` : entry.participant_id}</td>
                      <td>{entry.department ?? '—'}</td>
                      <td>{entry.trigger_metric ?? '—'}</td>
                      <td>{entry.intervention_type ?? '—'}</td>
                      <td style={{ textAlign: 'right', color: '#A5ACAF' }}>{entry.date_resolved ?? entry.date_actioned ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </DashboardShell>
  )
}
