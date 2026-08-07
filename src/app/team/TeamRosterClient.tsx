'use client'
import { useMemo, useState } from 'react'
import type { LeaderboardMetric, ParticipantRankContext } from '@/types'
import { Card, Badge, ScorePill } from '@/components/ui'
import { recoveryColor } from '@/lib/utils'

const METRICS: Array<{ key: LeaderboardMetric; label: string; helper: string }> = [
  { key: 'recovery', label: 'Recovery', helper: 'Recovery score percentile' },
  { key: 'workouts_logged', label: 'Workouts', helper: 'Workout logging context' },
  { key: 'points_earned', label: 'Points', helper: 'Points earned context' },
  { key: 'consistency_streak', label: 'Streak', helper: 'Consistency streak context' },
]

export function TeamRosterClient({ participantContext }: { participantContext: ParticipantRankContext }) {
  const [metric, setMetric] = useState<LeaderboardMetric>(participantContext.metric)
  const context = useMemo(() => participantContext, [participantContext])

  return (
    <Card title="Participant ranking context">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {METRICS.map((item) => (
          <button
            key={item.key}
            onClick={() => setMetric(item.key)}
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              border: metric === item.key ? '1px solid #69BE28' : '1px solid #0a3560',
              background: metric === item.key ? '#69BE28' : '#001a33',
              color: metric === item.key ? '#002244' : '#A5ACAF',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>{context.metric_label}</strong>
          <Badge variant={context.cohort_band === 'top' ? 'green' : context.cohort_band === 'middle' ? 'amber' : 'red'}>
            {context.percentile_label}
          </Badge>
        </div>
        <div style={{ fontSize: 13, color: '#A5ACAF' }}>{context.metric_description}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <ScorePill value={context.participant_value} />
          <div><strong>Rank</strong><div>{context.participant_rank} of {context.cohort_size}</div></div>
          <div><strong>Context</strong><div>{context.comparison_text}</div></div>
        </div>
        <div style={{ fontSize: 11, color: recoveryColor(context.participant_value) }}>{context.metric_value_label}</div>
        <div style={{ fontSize: 11, color: '#A5ACAF' }}>{context.safe_context_note}</div>
      </div>
    </Card>
  )
}
