'use client'

import { useEffect, useMemo, useState } from 'react'

// Labels for the five FR-13 (GH issue #66) engagement score components. Kept in
// sync with the read-only display of these same weights on the WD dashboard
// (src/app/wellness-director/WellnessDirectorClient.tsx).
const ENGAGEMENT_COMPONENT_LABELS: Record<string, string> = {
  submission_consistency: 'WHOOP/CSV submission consistency',
  device_wear_consistency: 'Device-wear consistency',
  pulse_completion: 'Pulse survey completion',
  nudge_response: 'Nudge response rate',
  workout_volume: 'Workout volume vs. baseline',
}

function engagementComponentLabel(key: string) {
  return ENGAGEMENT_COMPONENT_LABELS[key] ?? key
}

type WeightsState = {
  submission_consistency: number
  device_wear_consistency: number
  pulse_completion: number
  nudge_response: number
  workout_volume: number
}

const DEFAULT_WEIGHTS: WeightsState = {
  submission_consistency: 25,
  device_wear_consistency: 20,
  pulse_completion: 20,
  nudge_response: 15,
  workout_volume: 20,
}

// Engagement-score weights are set for the whole cohort (not per-participant),
// admin-only. Wellness Directors see these same values read-only, for
// visibility, on their dashboard.
export function EngagementWeightsAdminClient() {
  const [weights, setWeights] = useState<WeightsState>(DEFAULT_WEIGHTS)
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/wellness-director-config')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        const config = data?.config?.weights
        if (config) setWeights(config)
        setLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => { cancelled = true }
  }, [])

  const weightTotal = useMemo(() => Object.values(weights).reduce((sum, item) => sum + item, 0), [weights])
  const weightsValid = weightTotal === 100

  const persistWeights = async (nextWeights: WeightsState) => {
    setStatus('saving')
    setError('')
    try {
      const response = await fetch('/api/admin/wellness-director-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weights: nextWeights }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null
        setStatus('error')
        setError(data?.error ?? 'Failed to save weights.')
        return
      }
      setStatus('saved')
    } catch {
      setStatus('error')
      setError('Failed to save weights. Check your connection and try again.')
    }
  }

  if (!loaded) {
    return <div style={{ fontSize: 12, color: '#A5ACAF' }}>Loading weights…</div>
  }

  return (
    <div>
      {Object.entries(weights).map(([key, value]) => (
        <div key={key} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6, alignItems: 'center' }}>
            <label htmlFor={key} style={{ color: '#fff', fontSize: 12 }}>{engagementComponentLabel(key)}</label>
            <span style={{ color: '#A5ACAF', fontSize: 11 }}>{value}%</span>
          </div>
          <input
            id={key}
            aria-label={engagementComponentLabel(key)}
            className="range-control"
            type="range"
            min={0}
            max={100}
            value={value}
            onChange={(e) => {
              setWeights((current) => ({ ...current, [key]: Number(e.target.value) }))
              setStatus('dirty')
            }}
          />
        </div>
      ))}
      <div style={{ color: weightsValid ? '#69BE28' : '#FFA500', fontSize: 11, marginTop: 4 }}>
        Total: {weightTotal}% {weightsValid ? '— ready to save' : '— must total 100% before saving'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        <button
          className="btn-primary"
          type="button"
          disabled={!weightsValid || status === 'saving'}
          onClick={() => persistWeights(weights)}
          style={{ opacity: !weightsValid || status === 'saving' ? 0.6 : 1 }}
        >
          {status === 'saving' ? 'Saving…' : 'Save weights'}
        </button>
        <div style={{ color: status === 'error' ? '#ff6b6b' : '#A5ACAF', fontSize: 11 }}>
          {status === 'saved' ? 'Saved' : status === 'dirty' ? 'Unsaved changes' : status === 'error' ? error : ''}
        </div>
      </div>
    </div>
  )
}
