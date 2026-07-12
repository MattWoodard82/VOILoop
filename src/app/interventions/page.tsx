import { DashboardShell } from '@/components/layout/DashboardShell'
import { getInterventions, getEmployees } from '@/lib/supabase/queries'
import { KpiCard, Card, Badge, Alert, TimelineItem } from '@/components/ui'
import { AlertTriangle, Plus } from 'lucide-react'
import { formatDate } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function InterventionsPage() {
  const [interventions, employees] = await Promise.all([
    getInterventions(),
    getEmployees(),
  ])

  const empMap = Object.fromEntries(employees.map((e) => [e.id, e]))
  const pending = interventions.filter((i) => i.outcome === 'Pending')
  const inProgress = interventions.filter((i) => i.outcome === 'In Progress')
  const monitoring = interventions.filter((i) => i.outcome === 'Monitoring')
  const resolved = interventions.filter((i) => i.outcome === 'Resolved')

  const statusVariant = (s: string) =>
    s === 'Pending' ? 'red' : s === 'In Progress' ? 'amber' : s === 'Monitoring' ? 'wolf' : 'green'

  return (
    <DashboardShell title="Intervention Tracking">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 18 }}>
        <KpiCard label="Triggered interventions" value={pending.length + inProgress.length} color="#ff6b6b" delta={`${interventions.length} total records`} deltaDir="neutral" />
        <KpiCard label="Pending action" value={pending.length} color="#FFA500" delta={pending.length > 0 ? 'Wellness Director review needed' : 'No pending records'} deltaDir="neutral" />
        <KpiCard label="In progress" value={inProgress.length} color="#A5ACAF" delta={monitoring.length > 0 ? `${monitoring.length} in monitoring` : 'No monitoring records'} deltaDir="neutral" />
        <KpiCard label="Resolved interventions" value={resolved.length} color="#69BE28" delta={`${Math.max(interventions.length - resolved.length, 0)} still open`} deltaDir="neutral" />
      </div>

      <Card title="Active intervention log" badge={
        <button className="btn-primary" style={{ fontSize: 10, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 4 }} type="button" disabled title="Intervention creation is not wired yet">
          <Plus size={10} /> Log new (coming soon)
        </button>
      }>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 140 }}>Employee</th>
              <th>Trigger metric</th>
              <th>Value</th>
              <th>Intervention</th>
              <th>Assigned</th>
              <th>Triggered</th>
              <th style={{ textAlign: 'right' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {interventions.map((int) => {
              const emp = empMap[int.employee_id]
              return (
               <tr key={int.id} onClick={() => window.location.href = `/interventions/${int.id}`} style={{ cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(105,190,40,0.04)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{emp ? `${emp.first_name} ${emp.last_name}` : int.employee_id}</div>
                    <div style={{ fontSize: 10, color: '#A5ACAF' }}>{int.department}</div>
                  </td>
                  <td>{int.trigger_metric}</td>
                  <td style={{ fontWeight: 700, color: '#ff6b6b' }}>{int.trigger_value}</td>
                  <td>{int.intervention_type}</td>
                  <td style={{ color: '#A5ACAF' }}>{int.assigned_to}</td>
                  <td style={{ color: '#A5ACAF' }}>{int.date_triggered ? formatDate(int.date_triggered) : '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Badge variant={statusVariant(int.outcome) as any}>{int.outcome}</Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
        <Card title="Recommended actions">
          {pending.slice(0, 2).map((int, i, arr) => {
            const emp = empMap[int.employee_id]
            return (
              <TimelineItem
                key={int.id}
                color="#ff6b6b"
                title={emp ? `${emp.first_name} ${emp.last_name} — immediate review.` : 'Review required.'}
                body={int.notes ?? ''}
                meta={`Urgent · ${int.department}`}
                isLast={i === arr.length - 1 && inProgress.length === 0}
              />
            )
          })}
          {inProgress.map((int, i) => {
            const emp = empMap[int.employee_id]
            return (
              <TimelineItem
                key={int.id}
                color="#FFA500"
                title={emp ? `${emp.first_name} ${emp.last_name} — monitoring.` : 'Monitoring.'}
                body={int.notes ?? ''}
                meta={`In progress · ${int.department}`}
                isLast={i === inProgress.length - 1}
              />
            )
          })}
        </Card>

        <Card title="Status breakdown">
          {[
            { label: 'Pending', count: pending.length, color: '#ff6b6b' },
            { label: 'In progress', count: inProgress.length, color: '#FFA500' },
            { label: 'Monitoring', count: monitoring.length, color: '#A5ACAF' },
            { label: 'Resolved', count: resolved.length, color: '#69BE28' },
          ].map((s) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: '#A5ACAF', width: 100 }}>{s.label}</span>
              <div style={{ flex: 1, height: 8, background: '#0a3560', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${interventions.length > 0 ? (s.count / interventions.length) * 100 : 0}%`, height: '100%', background: s.color, borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: s.color, width: 20, textAlign: 'right' }}>{s.count}</span>
            </div>
          ))}
        </Card>
      </div>
    </DashboardShell>
  )
}
