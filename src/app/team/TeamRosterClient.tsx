'use client'
import { useEffect, useState } from 'react'
import type { LeaderboardMetric, ParticipantRankContext } from '@/types'
import { Card, Badge, ScorePill, LoadingNotice, SkeletonBlock } from '@/components/ui'

const METRICS: Array<{ key: LeaderboardMetric; label: string; helper: string }> = [
  { key: 'recovery', label: 'Recovery', helper: 'Recovery score percentile' },
  { key: 'workouts_logged', label: 'Workouts', helper: 'Workout logging context' },
  { key: 'points_earned', label: 'Points', helper: 'Points earned context' },
  { key: 'consistency_streak', label: 'Sleep consistency', helper: 'Sleep consistency context' },
]

export function TeamRosterClient({ participantContext }: { participantContext: ParticipantRankContext }) {
  const [metric, setMetric] = useState<LeaderboardMetric>(participantContext.metric)
  const [context, setContext] = useState(participantContext)
  const [loadingMetric, setLoadingMetric] = useState<LeaderboardMetric | null>(null)

  useEffect(() => {
    setContext(participantContext)
    setMetric(participantContext.metric)
  }, [participantContext])

  useEffect(() => {
    const controller = new AbortController()

    async function loadMetricContext() {
      if (metric === context.metric) return
      setLoadingMetric(metric)
      try {
        const response = await fetch(`/api/participant/ranking?metric=${encodeURIComponent(metric)}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Failed to load participant ranking context.')
        const payload = await response.json() as { context: ParticipantRankContext }
        setContext(payload.context)
      } finally {
        setLoadingMetric(null)
      }
    }

    void loadMetricContext()
    return () => controller.abort()
  }, [context.metric, metric])

  const valueColor = context.metric === 'recovery'
    ? '#69BE28'
    : context.metric === 'workouts_logged'
      ? '#A5ACAF'
      : context.metric === 'points_earned'
        ? '#7dd3fc'
        : '#c084fc'

  return (
    <Card title="Participant ranking context">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {METRICS.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={metric === item.key}
            aria-label={`${item.label} ranking context`}
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

      <div style={{ display: 'grid', gap: 10, minHeight: 140, position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>{context.metric_label}</strong>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {loadingMetric === metric ? <LoadingNotice>Loading…</LoadingNotice> : null}
            <Badge variant={context.cohort_band === 'top' ? 'green' : context.cohort_band === 'middle' ? 'amber' : 'red'}>
              {context.percentile_label}
            </Badge>
          </div>
        </div>
        <div style={{ fontSize: 13, color: '#A5ACAF' }}>
          {loadingMetric === metric ? <SkeletonBlock width="75%" height={12} radius={999} /> : context.metric_description}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <div>
            {loadingMetric === metric
              ? <SkeletonBlock width={56} height={24} radius={999} />
              : context.metric === 'recovery'
                ? <ScorePill value={context.participant_value} />
                : <ScorePill value={Math.min(100, context.participant_value)} />}
          </div>
          <div>
            <strong>Rank</strong>
            <div>{loadingMetric === metric ? <SkeletonBlock width="65%" height={12} radius={999} style={{ marginTop: 6 }} /> : `${context.participant_rank} of ${context.cohort_size}`}</div>
          </div>
          <div>
            <strong>Context</strong>
            <div>{loadingMetric === metric ? <SkeletonBlock width="90%" height={12} radius={999} style={{ marginTop: 6 }} /> : context.comparison_text}</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: valueColor }}>
          {loadingMetric === metric ? 'Loading…' : context.metric_value_label}
        </div>
        <div style={{ fontSize: 11, color: '#A5ACAF' }}>
          {loadingMetric === metric ? <SkeletonBlock width="80%" height={10} radius={999} /> : context.safe_context_note}
        </div>
      </div>
    </Card>
  )
}
