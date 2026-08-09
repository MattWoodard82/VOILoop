'use client'
import { useEffect, useMemo, useState } from 'react'
import type { ParticipantWithWellness } from '@/types'
import { Card, Badge, BarRow } from '@/components/ui'
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

export function WellnessDirectorClient({ participants }: Props) {
  const [deptFilter, setDeptFilter] = useState('All')
  const [personFilter, setPersonFilter] = useState('All')
  const [weights, setWeights] = useState({ recovery: 35, hrv: 15, sleep: 25, debt: 25 })
  const [overrides, setOverrides] = useState<Record<string, ParticipantWithWellness['override_state']>>({})
  const [overrideNotes, setOverrideNotes] = useState<Record<string, string>>({})
  const [snoozeDays, setSnoozeDays] = useState<Record<string, number>>({})
  const [configStatus, setConfigStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/wellness-director-config')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        const config = data?.config?.weights
        if (config) setWeights(config)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const departments = useMemo(() => ['All', ...Array.from(new Set(participants.map((e) => e.department))).sort()], [participants])

  const filtered = useMemo(() => {
    let result = [...participants]
    if (deptFilter !== 'All') result = result.filter((e) => e.department === deptFilter)
    if (personFilter !== 'All') result = result.filter((e) => e.id === personFilter)
    return result
  }, [participants, deptFilter, personFilter])

  const selected = personFilter !== 'All' ? filtered[0] ?? null : deptFilter !== 'All' ? filtered[0] ?? null : participants[0] ?? null
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
          className="form-select"
          style={{ color: '#fff' }}
          value={deptFilter}
          onChange={(e) => { setDeptFilter(e.target.value); setPersonFilter('All') }}
        >
          {departments.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select
          className="form-select"
          style={{ color: '#fff' }}
          value={personFilter}
          onChange={(e) => setPersonFilter(e.target.value)}
        >
          <option value="All">All participants</option>
          {participants.filter((e) => deptFilter === 'All' || e.department === deptFilter).map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
        <Card title="Engagement score" badge={<Badge variant="wolf">weighted</Badge>}>
          <WellnessDirectorCharts type="recovery" data={engagementRows.map((row) => ({ name: row.label, value: row.value, color: recoveryColor(row.value) }))} />
        </Card>
        <Card title="Score breakdown">
          {selected?.engagement_score_components ? Object.entries(selected.engagement_score_components).map(([key, value]) => <BarRow key={key} label={key} value={value} color="#69BE28" />) : <div>No participant selected.</div>}
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
          ) : null}
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card title="Baseline / overrides">
          {selected ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 12, color: '#A5ACAF' }}>
                {selected.baseline_state === 'building'
                  ? `Baseline building (${selected.baseline_days_remaining} days remaining)`
                  : 'Baseline ready'}
              </div>
              <div style={{ fontSize: 12, color: '#A5ACAF' }}>
                Override: <span style={{ color: '#fff' }}>{overrideLabel(overrides[selected.id] ?? selected.override_state)}</span>
              </div>
              <label style={{ display: 'grid', gap: 4, fontSize: 11, color: '#A5ACAF' }}>
                Note
                <input
                  aria-label="override note"
                  value={overrideNotes[selected.id] ?? ''}
                  onChange={(e) => setOverrideNotes((current) => ({ ...current, [selected.id]: e.target.value }))}
                  placeholder="Optional note"
                  style={{
                    width: '100%',
                    background: '#001a33',
                    border: '1px solid #0a3560',
                    borderRadius: 6,
                    padding: '8px 10px',
                    fontSize: 12,
                    color: '#fff',
                    fontFamily: 'Inter, sans-serif',
                  }}
                />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 11, color: '#A5ACAF' }}>
                Snooze days
                <input
                  aria-label="snooze days"
                  type="number"
                  min={1}
                  max={30}
                  value={snoozeDays[selected.id] ?? 7}
                  onChange={(e) => setSnoozeDays((current) => ({ ...current, [selected.id]: Number(e.target.value) }))}
                  style={{
                    width: 120,
                    background: '#001a33',
                    border: '1px solid #0a3560',
                    borderRadius: 6,
                    padding: '8px 10px',
                    fontSize: 12,
                    color: '#fff',
                    fontFamily: 'Inter, sans-serif',
                  }}
                />
              </label>
              <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => persistOverride(selected.id, 'snooze').catch(() => {})}
                >
                  Snooze
                </button>
                <button
                  type="button"
                  onClick={() => persistOverride(selected.id, 'dismiss').catch(() => {})}
                  style={{
                    background: '#001a33',
                    color: '#fff',
                    border: '1px solid #0a3560',
                    borderRadius: 6,
                    padding: '6px 14px',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif',
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#A5ACAF' }}>Choose a participant to review baseline status and overrides.</div>
          )}
        </Card>
        <Card title="Engagement-score weights">
          <div style={{ display: 'grid', gap: 10 }}>
            {Object.entries(weights).map(([key, value]) => (
              <div key={key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4, fontSize: 11, color: '#A5ACAF' }}>
                  <label htmlFor={key}>{key.replace(/_/g, ' ')}</label>
                  <span style={{ color: '#fff' }}>{value}%</span>
                </div>
                <input
                  id={key}
                  aria-label={key}
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
                  style={{ width: '100%', accentColor: '#69BE28' }}
                />
              </div>
            ))}
            <div style={{ fontSize: 11, color: configStatus === 'saved' ? '#69BE28' : '#A5ACAF' }}>
              {configStatus === 'saving' ? 'Saving…' : configStatus === 'saved' ? 'Saved' : ''}
            </div>
          </div>
        </Card>
      </div>
    </>
  )
}
