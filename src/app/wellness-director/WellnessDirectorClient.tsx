'use client'
import { useMemo, useState } from 'react'
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

  const departments = useMemo(() => ['All', ...Array.from(new Set(participants.map((e) => e.department))).sort()], [participants])

  const filtered = useMemo(() => {
    let result = [...participants]
    if (deptFilter !== 'All') result = result.filter((e) => e.department === deptFilter)
    if (personFilter !== 'All') result = result.filter((e) => e.id === personFilter)
    return result
  }, [participants, deptFilter, personFilter])

  const selected = personFilter !== 'All' ? filtered[0] : participants[0] ?? null
  const engagementRows = filtered.map((e) => ({
    label: `${e.first_name} ${e.last_name}`,
    value: e.engagement_score ?? 0,
  }))

  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setPersonFilter('All') }}>
          {departments.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}>
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
              <Badge variant={selected.risk_level === 'High' ? 'red' : selected.risk_level === 'Medium' ? 'amber' : 'green'}>{selected.risk_tier_label ?? selected.risk_level}</Badge>
              <div>{selected.risk_trigger_reasons?.join(' · ') ?? 'No triggers'}</div>
            </>
          ) : null}
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card title="Baseline / overrides">
          {selected ? (
            <>
              <div>{selected.baseline_state === 'building' ? `Baseline building (${selected.baseline_days_remaining} days remaining)` : 'Baseline ready'}</div>
              <div>Override: {overrideLabel(overrides[selected.id] ?? selected.override_state)}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" onClick={() => setOverrides((current) => ({ ...current, [selected.id]: 'snoozed' }))}>Snooze</button>
                <button type="button" onClick={() => setOverrides((current) => ({ ...current, [selected.id]: 'dismissed' }))}>Dismiss</button>
              </div>
            </>
          ) : (
            <div>Choose a participant to review baseline status and overrides.</div>
          )}
        </Card>
        <Card title="Engagement-score weights">
          {Object.entries(weights).map(([key, value]) => (
            <div key={key}>
              <label>{key}</label>
              <input aria-label={key} type="range" min={0} max={100} value={value} onChange={(e) => setWeights((current) => ({ ...current, [key]: Number(e.target.value) }))} />
            </div>
          ))}
        </Card>
      </div>
    </>
  )
}
