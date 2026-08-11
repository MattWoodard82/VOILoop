'use client'

import { Badge } from '@/components/ui'
import { formatDate } from '@/lib/utils'

interface Participant {
  id: string
  first_name: string
  last_name: string
  department?: string | null
}

interface Intervention {
  id: string
  participant_id: string
  trigger_metric: string
  trigger_value: string | number
  intervention_type: string
  assigned_to: string | null
  date_triggered: string | null
  outcome: string
  department: string | null
  notes: string | null
}

interface Props {
  interventions: Intervention[]
  empMap: Record<string, Participant>
}

const statusVariant = (s: string) =>
  s === 'Pending' ? 'red' : s === 'In Progress' ? 'amber' : s === 'Monitoring' ? 'wolf' : 'green'

export function InterventionsTableClient({ interventions, empMap }: Props) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th style={{ width: 140 }}>Participant</th>
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
          const emp = empMap[int.participant_id]
          return (
            <tr
              key={int.id}
              onClick={() => { window.location.href = `/interventions/${int.id}` }}
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(105,190,40,0.04)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <td>
                <div style={{ fontWeight: 600 }}>{emp ? `${emp.first_name} ${emp.last_name}` : int.participant_id}</div>
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
  )
}
