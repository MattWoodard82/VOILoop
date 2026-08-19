'use client'
import { useEffect, useMemo, useState } from 'react'
import type { ParticipantWithWellness } from '@/types'
import { Card, Badge, BarRow, ChartSkeleton, LoadingNotice, SkeletonBlock, TableSkeleton } from '@/components/ui'
import { recoveryColor } from '@/lib/utils'
import { WellnessDirectorCharts } from './WellnessDirectorCharts'

interface Props {
  participants: ParticipantWithWellness[]
}

function overrideLabel(state?: ParticipantWithWellness['override_state']) {
  if (state === 'snoozed') return 'Snoozed'
  if (state === 'dismissed') return 'Dismissed'
  return 'Active'
}

// Labels for the five FR-13 (GH issue #66) engagement score components, shared by
// the score breakdown card and the weight editor so both stay in sync.
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

export function WellnessDirectorClient({ participants }: Props) {
  const [deptFilter, setDeptFilter] = useState('All')
  const [personFilter, setPersonFilter] = useState('All')
  const [weights, setWeights] = useState({
    submission_consistency: 25,
    device_wear_consistency: 20,
    pulse_completion: 20,
    nudge_response: 15,
    workout_volume: 20,
  })
  const [overrides, setOverrides] = useState<Record<string, ParticipantWithWellness['override_state']>>({})
  const [overrideNotes, setOverrideNotes] = useState<Record<string, string>>({})
  const [snoozeDays, setSnoozeDays] = useState<Record<string, number>>({})
  const [configStatus, setConfigStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [configLoaded, setConfigLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/wellness-director-config')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        const config = data?.config?.weights
        if (config) setWeights(config)
        setConfigLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setConfigLoaded(true)
      })
    return () => { cancelled = true }
  }, [])

  const departments = useMemo(() => ['All', ...Array.from(new Set(participants.map((e) => e.department))).sort()], [participants])
  const filterSelectStyle = useMemo(() => ({
    border: '1px solid var(--navy-border)',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 11,
    background: 'var(--navy-dark)',
    color: '#fff',
    fontFamily: 'var(--font-inter), system-ui, sans-serif',
  }), [])

  const filtered = useMemo(() => {
    let result = [...participants]
    if (deptFilter !== 'All') result = result.filter((e) => e.department === deptFilter)
    if (personFilter !== 'All') result = result.filter((e) => e.id === personFilter)
    return result
  }, [participants, deptFilter, personFilter])

  const scopedParticipants = useMemo(
    () => participants.filter((e) => deptFilter === 'All' || e.department === deptFilter),
    [participants, deptFilter],
  )
  const hasExplicitParticipantSelection = personFilter !== 'All'
  const selected = hasExplicitParticipantSelection
    ? scopedParticipants.find((participant) => participant.id === personFilter) ?? null
    : null
  const engagementRows = filtered
    .filter((e) => e.engagement_score != null)
    .map((e) => ({
      label: `${e.first_name} ${e.last_name}`,
      value: e.engagement_score as number,
    }))

  const persistOverride = async (participantId: string, action: 'snooze' | 'dismiss') => {
    const response = await fetch('/api/admin/wellness-director-overrides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participant_id: participantId,
        action,
        note: overrideNotes[participantId] ?? null,
        snooze_until: action === 'snooze' ? new Date(Date.now() + (Number(snoozeDays[participantId] ?? 7) * 86400000)).toISOString() : null,
      }),
    })
    if (!response.ok) throw new Error('Failed to persist override')
    const data = await response.json()
    const state = action === 'snooze' ? 'snoozed' : 'dismissed'
    setOverrides((current) => ({ ...current, [participantId]: state }))
    return data
  }

  const persistWeights = async (nextWeights: typeof weights) => {
    setConfigStatus('saving')
    const response = await fetch('/api/admin/wellness-director-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weights: nextWeights }),
    })
    if (!response.ok) {
      setConfigStatus('idle')
      throw new Error('Failed to save config')
    }
    setConfigStatus('saved')
    return response.json()
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <select
          value={deptFilter}
          onChange={(e) => { setDeptFilter(e.target.value); setPersonFilter('All') }}
          style={filterSelectStyle}
        >
          {departments.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)} style={filterSelectStyle}>
          <option value="All">All participants</option>
          {participants.filter((e) => deptFilter === 'All' || e.department === deptFilter).map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
        <Card title="Engagement score" badge={<Badge variant="wolf">weighted</Badge>}>
          {configLoaded ? (
            <WellnessDirectorCharts type="recovery" data={engagementRows.map((row) => ({ name: row.label, value: row.value, color: recoveryColor(row.value) }))} />
          ) : (
            <ChartSkeleton height={210} />
          )}
        </Card>
        <Card title="Score breakdown">
          {!configLoaded ? (
            <TableSkeleton columns={2} rows={5} />
          ) : selected?.engagement_score_components ? (
            Object.entries(selected.engagement_score_components).map(([key, value]) => (
              <BarRow key={key} label={engagementComponentLabel(key)} value={value} color="#69BE28" />
            ))
          ) : (
            <div>{hasExplicitParticipantSelection ? 'No score breakdown available for the selected participant.' : 'Choose a participant to view score breakdown.'}</div>
          )}
        </Card>
        <Card title="Physiological trend">
          {selected ? (
            <>
              <Badge variant={selected.physiological_trend === 'declining' ? 'red' : selected.physiological_trend === 'improving' ? 'green' : 'amber'}>{selected.physiological_trend ?? 'steady'}</Badge>
              <div>{selected.physiological_trend_metrics?.join(', ') ?? '—'}</div>
            </>
          ) : null}
        </Card>
        <Card title="Risk tier">
          {selected ? (
            <>
              {selected.baseline_state === 'building' ? (
                <Badge variant="wolf">Building baseline</Badge>
              ) : (
                <Badge variant={selected.risk_level === 'High' ? 'red' : selected.risk_level === 'Medium' ? 'amber' : 'green'}>{selected.risk_tier_label ?? selected.risk_level}</Badge>
              )}
              <div>{selected.risk_trigger_reasons && selected.risk_trigger_reasons.length > 0 ? selected.risk_trigger_reasons.join(' · ') : selected.baseline_state === 'building' ? 'Baseline still forming' : 'No triggers'}</div>
            </>
          ) : <div>Choose a participant to view risk tier.</div>}
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card title="Baseline / overrides">
          {selected ? (
            <>
              <div>{selected.baseline_state === 'building' ? `Baseline building (${selected.baseline_days_remaining} days remaining)` : 'Baseline ready'}</div>
              <div>Override: {overrideLabel(overrides[selected.id] ?? selected.override_state)}</div>
              <input
                aria-label="override note"
                value={overrideNotes[selected.id] ?? ''}
                onChange={(e) => setOverrideNotes((current) => ({ ...current, [selected.id]: e.target.value }))}
                placeholder="Optional note"
              />
              <input
                aria-label="snooze days"
                type="number"
                min={1}
                max={30}
                value={snoozeDays[selected.id] ?? 7}
                onChange={(e) => setSnoozeDays((current) => ({ ...current, [selected.id]: Number(e.target.value) }))}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" onClick={() => persistOverride(selected.id, 'snooze')}>Snooze</button>
                <button type="button" onClick={() => persistOverride(selected.id, 'dismiss')}>Dismiss</button>
              </div>
            </>
          ) : (
            <div>Choose a participant to review baseline status and overrides.</div>
          )}
        </Card>
        <Card title="Engagement-score weights">
          {!configLoaded ? (
            <div style={{ display: 'grid', gap: 12, minHeight: 180 }}>
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} style={{ display: 'grid', gap: 6 }}>
                  <SkeletonBlock width="48%" height={10} radius={999} />
                  <SkeletonBlock width="100%" height={20} radius={999} />
                </div>
              ))}
            </div>
          ) : (
            <>
              {Object.entries(weights).map(([key, value]) => (
                <div key={key}>
                  <label htmlFor={key}>{engagementComponentLabel(key)}</label>
                  <input
                    id={key}
                    aria-label={engagementComponentLabel(key)}
                    type="range"
                    min={0}
                    max={100}
                    value={value}
                    onChange={(e) => {
                      const next = { ...weights, [key]: Number(e.target.value) }
                      const total = Object.values(next).reduce((sum, item) => sum + item, 0)
                      if (total === 100) {
                        setWeights(next)
                        persistWeights(next).catch(() => setConfigStatus('idle'))
                      }
                    }}
                  />
                </div>
              ))}
            </>
          )}
          <div>{configStatus === 'saving' ? 'Saving…' : configStatus === 'saved' ? 'Saved' : !configLoaded ? <LoadingNotice>Loading weights…</LoadingNotice> : ''}</div>
        </Card>
      </div>
    </>
  )
}
