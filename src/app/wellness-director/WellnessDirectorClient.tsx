'use client'
import { useEffect, useMemo, useState } from 'react'
import type { ParticipantWithWellness } from '@/types'
import { Card, Badge, BarRow, ChartSkeleton, LoadingNotice, SkeletonBlock, TableSkeleton } from '@/components/ui'
import { recoveryColor } from '@/lib/utils'
import { WellnessDirectorCharts } from './WellnessDirectorCharts'
import type { ParticipantScoreResult, TeamHealthComponentKey, Window as ThsWindow } from '@/lib/team-health-score'
import type { TeamHealthScoreConfig } from '@/lib/team-health-score-config'

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

type ZoneMinutes = { zone1: number | null; zone2: number | null; zone3: number | null; zone4: number | null; zone5: number | null }
type Averages = { avgWeightedScore: number | null; avgWearConsistency: number | null; avgZoneMinutes: ZoneMinutes }

function formatStat(value: number | null, suffix = '') {
  return value != null ? `${value}${suffix}` : '—'
}

// Renders one averages block (either the whole cohort/department scope, or a single
// selected participant) beneath the Engagement score chart. Avg steps is intentionally
// omitted: WHOOP does not report step count anywhere in the CSV export or our schema.
function AveragesBlock({ title, averages }: { title: string; averages: Averages }) {
  return (
    <div style={{ background: '#001a33', border: '1px solid #0a3560', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, fontSize: 11, color: '#A5ACAF' }}>
        <div>Avg weighted score: <strong style={{ color: '#fff' }}>{formatStat(averages.avgWeightedScore)}</strong></div>
        <div>Avg wear consistency: <strong style={{ color: '#fff' }}>{formatStat(averages.avgWearConsistency, '%')}</strong></div>
        <div style={{ gridColumn: '1 / -1' }}>
          Avg zone 1-5 duration (min): {' '}
          <strong style={{ color: '#fff' }}>
            Z1 {formatStat(averages.avgZoneMinutes.zone1)} · Z2 {formatStat(averages.avgZoneMinutes.zone2)} · Z3 {formatStat(averages.avgZoneMinutes.zone3)} · Z4 {formatStat(averages.avgZoneMinutes.zone4)} · Z5 {formatStat(averages.avgZoneMinutes.zone5)}
          </strong>
        </div>
        <div style={{ gridColumn: '1 / -1', color: '#6b7580' }}>Avg steps: not available (no WHOOP steps data source).</div>
      </div>
    </div>
  )
}

function averageOf(values: Array<number | null | undefined>) {
  const valid = values.filter((v): v is number => v != null)
  if (valid.length === 0) return null
  return Math.round((valid.reduce((sum, v) => sum + v, 0) / valid.length) * 10) / 10
}

function computeAverages(group: ParticipantWithWellness[]): Averages {
  return {
    avgWeightedScore: averageOf(group.map((p) => p.engagement_score)),
    avgWearConsistency: averageOf(group.map((p) => p.engagement_score_components?.device_wear_consistency)),
    avgZoneMinutes: {
      zone1: averageOf(group.map((p) => p.avg_zone_minutes?.zone1)),
      zone2: averageOf(group.map((p) => p.avg_zone_minutes?.zone2)),
      zone3: averageOf(group.map((p) => p.avg_zone_minutes?.zone3)),
      zone4: averageOf(group.map((p) => p.avg_zone_minutes?.zone4)),
      zone5: averageOf(group.map((p) => p.avg_zone_minutes?.zone5)),
    },
  }
}

// Labels for Matt's 5-metric Team Health Score (GH issue #119) — a separate,
// physiological composite from the FR-13 engagement score above, with its own
// fixed (non-admin-configurable) component weights.
const THS_COMPONENT_LABELS: Record<TeamHealthComponentKey, string> = {
  sleep: 'Sleep Duration',
  hrv: 'HRV Trend',
  zone2: 'Zone 2+ Activity',
  recovery: 'Recovery Score',
  strain: 'Strain-Recovery Balance',
}
const THS_COMPONENT_KEYS = Object.keys(THS_COMPONENT_LABELS) as TeamHealthComponentKey[]
const NO_DATA_COLOR = '#3a4550'

// Default "Current" window: the Monday of the most recently FULLY COMPLETED
// Monday-Sunday week (not the still-in-progress current week), matching
// Matt's report cadence. Prev/Next navigation moves in 7-day steps from here.
function mostRecentCompletedMonday(referenceDate = new Date()): string {
  const day = referenceDate.getUTCDay() // 0=Sun .. 6=Sat
  const daysSinceMonday = (day + 6) % 7
  const thisMonday = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate() - daysSinceMonday))
  thisMonday.setUTCDate(thisMonday.getUTCDate() - 7)
  return thisMonday.toISOString().slice(0, 10)
}

function shiftDateStr(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatWindowLabel(window: ThsWindow) {
  return `${window.start} – ${window.end}`
}

export function WellnessDirectorClient({ participants }: Props) {
  const [deptFilter, setDeptFilter] = useState('All')
  const [personFilter, setPersonFilter] = useState('All')
  const [weights, setWeights] = useState<WeightsState>(DEFAULT_WEIGHTS)
  const [overrides, setOverrides] = useState<Record<string, ParticipantWithWellness['override_state']>>({})
  const [overrideNotes, setOverrideNotes] = useState<Record<string, string>>({})
  const [snoozeDays, setSnoozeDays] = useState<Record<string, number>>({})
  const [configLoaded, setConfigLoaded] = useState(false)
  const [nudgeMessage, setNudgeMessage] = useState('')
  const [nudgeStatus, setNudgeStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [nudgeError, setNudgeError] = useState('')

  // Team Health Score (GH #119) state.
  const [currentStart, setCurrentStart] = useState<string>(() => mostRecentCompletedMonday())
  const [teamHealthScore, setTeamHealthScore] = useState<ParticipantScoreResult | null>(null)
  const [thsLoading, setThsLoading] = useState(false)
  const [thsError, setThsError] = useState('')
  const [baselineConfig, setBaselineConfig] = useState<TeamHealthScoreConfig | null>(null)
  const [baselineLoaded, setBaselineLoaded] = useState(false)

  // Both the engagement-score weights and the Team Health Score baseline window
  // are admin-only settings, editable only from the Admin Console (whole-cohort
  // scope). This dashboard only fetches and displays them read-only, for
  // visibility, regardless of the signed-in user's role.
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

  // Reset the nudge draft whenever the selected participant changes, so switching
  // from one participant to another can't leave a stale draft or "Sent"/"error"
  // status that appears to belong to (and could be sent to) the wrong person.
  useEffect(() => {
    setNudgeMessage('')
    setNudgeStatus('idle')
    setNudgeError('')
  }, [personFilter])

  // Loads the admin-configured Team Health Score baseline window (cohort-wide,
  // read-only here; editable in the Admin Console).
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/team-health-score-config')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        const config = data?.config
        if (config) {
          setBaselineConfig({ baselineStart: config.baselineStart, baselineEnd: config.baselineEnd })
        }
        setBaselineLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setBaselineLoaded(true)
      })
    return () => { cancelled = true }
  }, [])

  const departments = useMemo(() => ['All', ...Array.from(new Set(participants.map((e) => e.department))).sort()], [participants])
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

  const cohortAverages = useMemo(() => computeAverages(scopedParticipants), [scopedParticipants])
  const selectedAverages = useMemo(() => (selected ? computeAverages([selected]) : null), [selected])

  // Recomputes the selected participant's Team Health Score whenever they change,
  // the WD navigates to a different reporting week, or the admin saves a new
  // baseline window - otherwise both the trend chart and 5-metric breakdown below
  // would keep showing scores computed against the previous baseline until the
  // next unrelated navigation or a full reload.
  useEffect(() => {
    if (!selected) {
      setTeamHealthScore(null)
      setThsError('')
      return
    }
    let cancelled = false
    setThsLoading(true)
    setThsError('')
    fetch(`/api/admin/team-health-score?participantId=${encodeURIComponent(selected.id)}&currentStart=${currentStart}`)
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (cancelled) return
        if (!response.ok) {
          setThsError(data?.error ?? 'Failed to load Team Health Score.')
          setTeamHealthScore(null)
          return
        }
        setTeamHealthScore(data.score)
      })
      .catch(() => {
        if (!cancelled) setThsError('Failed to load Team Health Score. Check your connection and try again.')
      })
      .finally(() => {
        if (!cancelled) setThsLoading(false)
      })
    return () => { cancelled = true }
  }, [selected, currentStart, baselineConfig])

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

  const sendNudge = async (participantId: string) => {
    if (!nudgeMessage.trim()) return
    setNudgeStatus('sending')
    setNudgeError('')
    try {
      const response = await fetch('/api/admin/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: nudgeMessage.trim(),
          target_type: 'participant',
          participant_id: participantId,
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null
        setNudgeStatus('error')
        setNudgeError(payload?.error ?? 'Failed to send nudge.')
        return
      }
      setNudgeStatus('sent')
      setNudgeMessage('')
    } catch {
      // fetch() itself rejects on network/offline/timeout failures (as opposed to
      // a non-ok HTTP response, handled above) - without this, those failures
      // would leave the button stuck in "Sending…" forever.
      setNudgeStatus('error')
      setNudgeError('Failed to send nudge. Check your connection and try again.')
    }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <select
          value={deptFilter}
          onChange={(e) => { setDeptFilter(e.target.value); setPersonFilter('All') }}
          className="form-select"
        >
          {departments.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)} className="form-select">
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
          {configLoaded && (
            <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
              <AveragesBlock title="Cohort averages" averages={cohortAverages} />
              {selected && selectedAverages && (
                <AveragesBlock title={`${selected.first_name} ${selected.last_name}`} averages={selectedAverages} />
              )}
            </div>
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
          <div style={{ fontSize: 11, color: '#A5ACAF', marginBottom: 8 }}>
            &quot;Baseline&quot; shows whether this participant has enough logged history to power
            trend/risk comparisons yet. &quot;Override&quot; lets you snooze or dismiss an
            automatic risk flag for a set number of days (e.g. after you&apos;ve already
            followed up) without changing the participant&apos;s underlying data or scores.
          </div>
          {selected ? (
            <>
              <div>{selected.baseline_state === 'building' ? `Baseline building (${selected.baseline_days_remaining} days remaining)` : 'Baseline ready'}</div>
              <div>Override: {overrideLabel(overrides[selected.id] ?? selected.override_state)}</div>
              <input
                aria-label="override note"
                className="form-control-dark"
                value={overrideNotes[selected.id] ?? ''}
                onChange={(e) => setOverrideNotes((current) => ({ ...current, [selected.id]: e.target.value }))}
                placeholder="Optional note"
              />
              <input
                aria-label="snooze days"
                className="form-control-dark"
                type="number"
                min={1}
                max={30}
                value={snoozeDays[selected.id] ?? 7}
                onChange={(e) => setSnoozeDays((current) => ({ ...current, [selected.id]: Number(e.target.value) }))}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn-primary" type="button" onClick={() => persistOverride(selected.id, 'snooze')}>Snooze</button>
                <button className="btn-primary" type="button" onClick={() => persistOverride(selected.id, 'dismiss')}>Dismiss</button>
              </div>
            </>
          ) : (
            <div>Choose a participant to review baseline status and overrides.</div>
          )}
        </Card>
       <Card title="Engagement-score weights" badge={<Badge variant="wolf">view only</Badge>}>
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
               <BarRow key={key} label={engagementComponentLabel(key)} value={value} color="#69BE28" />
             ))}
             <div style={{ color: '#A5ACAF', fontSize: 11, marginTop: 8 }}>
               Set by an admin for the whole cohort in the Admin Console. Contact an admin to request a change.
             </div>
           </>
         )}
         <div>{!configLoaded ? <LoadingNotice>Loading weights…</LoadingNotice> : ''}</div>
       </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
        <Card title="Team Health Score Trend" badge={teamHealthScore?.current.lowConfidence ? <Badge variant="amber">low confidence</Badge> : undefined}>
          {!selected ? (
            <div>Choose a participant to view their Team Health Score trend.</div>
          ) : thsLoading ? (
            <ChartSkeleton height={210} />
          ) : thsError ? (
            <div style={{ color: '#ff6b6b', fontSize: 12 }}>{thsError}</div>
          ) : teamHealthScore ? (
            <>
              <WellnessDirectorCharts
                type="recovery"
                seriesName="Team Health Score"
                data={[
                  { name: 'Baseline', value: teamHealthScore.baseline.composite ?? 0, color: teamHealthScore.baseline.composite != null ? recoveryColor(teamHealthScore.baseline.composite) : NO_DATA_COLOR, label: teamHealthScore.baseline.composite == null ? 'No data' : undefined },
                  { name: 'Last Week', value: teamHealthScore.lastWeek.composite ?? 0, color: teamHealthScore.lastWeek.composite != null ? recoveryColor(teamHealthScore.lastWeek.composite) : NO_DATA_COLOR, label: teamHealthScore.lastWeek.composite == null ? 'No data' : undefined },
                  { name: 'Current', value: teamHealthScore.current.composite ?? 0, color: teamHealthScore.current.composite != null ? recoveryColor(teamHealthScore.current.composite) : NO_DATA_COLOR, label: teamHealthScore.current.composite == null ? 'No data' : undefined },
                ]}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button className="btn-primary" type="button" onClick={() => setCurrentStart((d) => shiftDateStr(d, -7))}>◀ Prev week</button>
                <div style={{ fontSize: 11, color: '#A5ACAF' }}>Current window: {formatWindowLabel(teamHealthScore.current.window)}</div>
                <button className="btn-primary" type="button" onClick={() => setCurrentStart((d) => shiftDateStr(d, 7))}>Next week ▶</button>
              </div>
              {teamHealthScore.current.missingComponents.length > 0 && (
                <div style={{ color: '#FFA500', fontSize: 11, marginTop: 8 }}>
                  Missing data this window: {teamHealthScore.current.missingComponents.map((key) => THS_COMPONENT_LABELS[key]).join(', ')}. The composite score above reflects only the components with data.
                </div>
              )}
              {teamHealthScore.current.lowConfidence && (
                <div style={{ color: '#FFA500', fontSize: 11, marginTop: 4 }}>
                  Low confidence: device worn only {teamHealthScore.current.coveragePct}% of days this window.
                </div>
              )}
            </>
          ) : null}
        </Card>
        <Card title="5-Metric Breakdown">
          {!selected ? (
            <div>Choose a participant to view their 5-metric breakdown.</div>
          ) : thsLoading ? (
            <TableSkeleton columns={2} rows={5} />
          ) : thsError ? (
            <div style={{ color: '#ff6b6b', fontSize: 12 }}>{thsError}</div>
          ) : teamHealthScore ? (
            <>
              <WellnessDirectorCharts
                type="recovery"
                seriesName="Score"
                data={THS_COMPONENT_KEYS.map((key) => {
                  const value = teamHealthScore.current[key]
                  return {
                    name: THS_COMPONENT_LABELS[key],
                    value: value ?? 0,
                    color: value != null ? recoveryColor(value) : NO_DATA_COLOR,
                  }
                })}
              />
              <div style={{ marginTop: 8, fontSize: 12, color: '#fff' }}>
                Composite: <strong>{teamHealthScore.current.composite != null ? teamHealthScore.current.composite : 'No data this window'}</strong>
                {teamHealthScore.current.band && <span style={{ color: '#A5ACAF' }}> · {teamHealthScore.current.band}</span>}
              </div>
            </>
          ) : null}
        </Card>
      </div>

      <div style={{ marginTop: 14 }}>
        <Card title="Team Health Score baseline window" badge={<Badge variant="wolf">view only</Badge>}>
          {!baselineLoaded ? (
            <LoadingNotice>Loading baseline window…</LoadingNotice>
          ) : (
            <>
              <div style={{ color: '#fff', fontSize: 12 }}>
                {baselineConfig ? formatWindowLabel({ start: baselineConfig.baselineStart, end: baselineConfig.baselineEnd }) : '—'}
              </div>
              <div style={{ color: '#A5ACAF', fontSize: 11, marginTop: 8 }}>
                Set by an admin in the Admin Console, applies to the whole cohort. Contact an admin to request a change.
              </div>
            </>
          )}
        </Card>
      </div>

      {selected && (
        <div style={{ marginTop: 14 }}>
          <Card title={`Send a nudge to ${selected.first_name} ${selected.last_name}`}>
            <textarea
              aria-label="nudge message"
              className="form-control-dark"
              value={nudgeMessage}
              onChange={(e) => { setNudgeMessage(e.target.value); if (nudgeStatus !== 'idle') setNudgeStatus('idle') }}
              placeholder="Write a short message for this participant…"
              rows={3}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
              <button
                className="btn-primary"
                type="button"
                disabled={!nudgeMessage.trim() || nudgeStatus === 'sending'}
                onClick={() => sendNudge(selected.id)}
                style={{ opacity: !nudgeMessage.trim() || nudgeStatus === 'sending' ? 0.6 : 1 }}
              >
                {nudgeStatus === 'sending' ? 'Sending…' : 'Send nudge'}
              </button>
              <div role="status" aria-live="polite" style={{ color: nudgeStatus === 'error' ? '#ff6b6b' : '#A5ACAF', fontSize: 11 }}>
                {nudgeStatus === 'sent' ? 'Sent' : nudgeStatus === 'error' ? nudgeError : ''}
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}
