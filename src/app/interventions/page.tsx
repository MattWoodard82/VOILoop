import { DashboardShell } from '@/components/layout/DashboardShell'
import { getInterventions, getParticipants } from '@/lib/supabase/queries'
import { KpiCard, Card, TimelineItem } from '@/components/ui'
import { requireAuth } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { InterventionCreateClient } from './InterventionCreateClient'
import { InterventionsTableClient } from './InterventionsTableClient'

export const dynamic = 'force-dynamic'

export default async function InterventionsPage() {
  const access = await requireAuth()
  if ('redirect' in access && access.redirect) redirect(access.redirect)
  if (!access.role || !['admin', 'wellness_director'].includes(access.role)) redirect('/my')

  const [interventions, participants] = await Promise.all([
    getInterventions(),
    getParticipants(),
  ])

  const empMap = Object.fromEntries(participants.map((e) => [e.id, e]))
  const interventionsForTable = interventions.map((int) => ({
    id: int.id,
    participant_id: int.participant_id,
    trigger_metric: int.trigger_metric,
    trigger_value: int.trigger_value,
    intervention_type: int.intervention_type,
    assigned_to: int.assigned_to ?? null,
    date_triggered: int.date_triggered ?? null,
    outcome: int.outcome,
    department: int.department ?? null,
    notes: int.notes ?? null,
  }))
  const pending = interventions.filter((i) => i.outcome === 'Pending')
  const inProgress = interventions.filter((i) => i.outcome === 'In Progress')
  const monitoring = interventions.filter((i) => i.outcome === 'Monitoring')
  const resolved = interventions.filter((i) => i.outcome === 'Resolved')

  return (
    <DashboardShell title="Intervention Tracking">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 18 }}>
        <KpiCard label="Triggered interventions" value={pending.length + inProgress.length} color="#ff6b6b" delta={`${interventions.length} total records`} deltaDir="neutral" />
        <KpiCard label="Pending action" value={pending.length} color="#FFA500" delta={pending.length > 0 ? 'Wellness Director review needed' : 'No pending records'} deltaDir="neutral" />
        <KpiCard label="In progress" value={inProgress.length} color="#A5ACAF" delta={monitoring.length > 0 ? `${monitoring.length} in monitoring` : 'No monitoring records'} deltaDir="neutral" />
        <KpiCard label="Resolved interventions" value={resolved.length} color="#69BE28" delta={`${Math.max(interventions.length - resolved.length, 0)} still open`} deltaDir="neutral" />
      </div>

      <Card
        title="Active intervention log"
        badge={(
          <InterventionCreateClient
            participants={participants.map((participant) => ({
              id: participant.id,
              first_name: participant.first_name,
              last_name: participant.last_name,
              department: participant.department,
            }))}
          />
        )}
      >
        <InterventionsTableClient interventions={interventionsForTable} empMap={empMap} />
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
        <Card title="Recommended actions">
          {pending.slice(0, 2).map((int, i, arr) => {
            const emp = empMap[int.participant_id]
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
            const emp = empMap[int.participant_id]
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
