'use client'
import { useEffect, useMemo, useState } from 'react'
import type { ParticipantWithWellness } from '@/types'
import { Card, Badge, BarRow, ChartSkeleton, LoadingNotice, SkeletonBlock, TableSkeleton } from '@/components/ui'
import { recoveryColor } from '@/lib/utils'
import { WellnessDirectorCharts } from './WellnessDirectorCharts'
import type { ParticipantScoreResult, TeamHealthComponentKey, Window as ThsWindow } from '@/lib/team-health-score'
import type { TeamHealthScoreConfig } from '@/lib/team-health-score-config'
import type { NudgeHistoryEntry, WeeklyResponseRateRow } from '@/lib/supabase/queries'

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

// Risk tier buckets for the cohort-wide composition breakdown shown on the Risk
// tier card when no participant is selected. Mirrors the risk_level ->
// risk_tier_label mapping used server-side (see queries.ts getTeamDashboard).
const RISK_TIER_BUCKETS: { level: ParticipantWithWellness['risk_level']; label: string; color: string }[] = [
  { level: 'High', label: 'High concern', color: '#ff6b6b' },
  { level: 'Medium', label: 'Watch', color: '#FFA500' },
  { level: 'Low', label: 'Stable', color: '#69BE28' },
]

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

// Formats the participant-header engagement-score delta vs. the cohort average,
// e.g. "+11 vs. cohort avg (27)". Omitted (empty string) when either side of the
// comparison is null, since there's nothing meaningful to render.
function engagementDeltaLabel(score: number | null | undefined, cohortAvg: number | null | undefined): string {
  if (score == null || cohortAvg == null) return ''
  const delta = Math.round(score - cohortAvg)
  const sign = delta >= 0 ? '+' : '-'
  return `${sign}${Math.abs(delta)} vs. cohort avg (${Math.round(cohortAvg)})`
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

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

  // Searchable participant combobox (replaces the separate department/person
  // <select> dropdowns) - drives the same deptFilter/personFilter state above,
  // it's only a different input UI/UX layer on top of the existing filtering.
  const [comboQuery, setComboQuery] = useState('')
  const [comboOpen, setComboOpen] = useState(false)

  // Recent nudges & responses (per-participant nudge history) state.
  const [nudgeHistory, setNudgeHistory] = useState<NudgeHistoryEntry[]>([])
  const [nudgeHistoryLoading, setNudgeHistoryLoading] = useState(false)
  const [nudgeHistoryError, setNudgeHistoryError] = useState('')

  // Weekly response rate (Mon-Sun submission grid) state.
  const [weeklyResponseRate, setWeeklyResponseRate] = useState<WeeklyResponseRateRow[]>([])
  const [weeklyResponseRateLoading, setWeeklyResponseRateLoading] = useState(true)
  const [weeklyResponseRateError, setWeeklyResponseRateError] = useState('')
  const [weeklyShowAll, setWeeklyShowAll] = useState(false)

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
  const riskComposition = useMemo(
    () => RISK_TIER_BUCKETS.map((bucket) => ({
      ...bucket,
      count: scopedParticipants.filter((participant) => participant.risk_level === bucket.level).length,
    })),
    [scopedParticipants],
  )
  const selectedAverages = useMemo(() => (selected ? computeAverages([selected]) : null), [selected])

  // Participant matches for the search combobox, scoped by the current department
  // filter (mirrors scopedParticipants) and narrowed by the typed query.
  const comboMatches = useMemo(() => {
    const query = comboQuery.trim().toLowerCase()
    const pool = query
      ? scopedParticipants.filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(query))
      : scopedParticipants
    return pool.slice(0, 8)
  }, [scopedParticipants, comboQuery])

  const weeklyResponseRateByParticipant = useMemo(
    () => new Map(weeklyResponseRate.map((row) => [row.participant_id, row])),
    [weeklyResponseRate],
  )
  const weeklyRowsToShow = weeklyShowAll ? scopedParticipants : scopedParticipants.slice(0, 8)


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

  // Loads the selected participant's history of individually-targeted nudges +
  // response status for the "Recent nudges & responses" card, following the same
  // fetch-on-selection-change pattern as the Team Health Score effect above.
  useEffect(() => {
    if (!selected) {
      setNudgeHistory([])
      setNudgeHistoryError('')
      return
    }
    let cancelled = false
    setNudgeHistoryLoading(true)
    setNudgeHistoryError('')
    fetch(`/api/admin/nudge-history?participantId=${encodeURIComponent(selected.id)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (cancelled) return
        if (!response.ok) {
          setNudgeHistoryError(data?.error ?? 'Failed to load nudge history.')
          setNudgeHistory([])
          return
        }
        setNudgeHistory(data.history ?? [])
      })
      .catch(() => {
        if (!cancelled) setNudgeHistoryError('Failed to load nudge history. Check your connection and try again.')
      })
      .finally(() => {
        if (!cancelled) setNudgeHistoryLoading(false)
      })
    return () => { cancelled = true }
  }, [selected])

  // Loads the whole cohort's Mon-Sun submission grid for the "Weekly response
  // rate" card. Uses the most recently completed week (same convention as
  // mostRecentCompletedMonday) rather than currentStart, since this card reports
  // on submission completeness independent of the WD's THS week navigation.
  useEffect(() => {
    let cancelled = false
    setWeeklyResponseRateLoading(true)
    setWeeklyResponseRateError('')
    fetch(`/api/admin/weekly-response-rate?weekStart=${mostRecentCompletedMonday()}`)
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (cancelled) return
        if (!response.ok) {
          setWeeklyResponseRateError(data?.error ?? 'Failed to load weekly response rate.')
          setWeeklyResponseRate([])
          return
        }
        setWeeklyResponseRate(data.rows ?? [])
      })
      .catch(() => {
        if (!cancelled) setWeeklyResponseRateError('Failed to load weekly response rate. Check your connection and try again.')
      })
      .finally(() => {
        if (!cancelled) setWeeklyResponseRateLoading(false)
      })
    return () => { cancelled = true }
  }, [])

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
        <div style={{ position: 'relative', flex: '1 1 320px', maxWidth: 420 }}>
          <input
            aria-label="Search or choose a participant"
            className="form-control-dark"
            style={{ width: '100%', boxSizing: 'border-box' }}
            placeholder="Search or choose a participant to drill in..."
            value={comboQuery}
            onFocus={() => setComboOpen(true)}
            onChange={(e) => { setComboQuery(e.target.value); setComboOpen(true) }}
            onBlur={() => setTimeout(() => setComboOpen(false), 150)}
          />
          <div
            role="listbox"
            aria-hidden={!comboOpen}
            style={{
              display: comboOpen ? 'block' : 'none',
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 10,
              background: '#001a33',
              border: '1px solid #0a3560',
              borderRadius: 8,
              marginTop: 4,
              maxHeight: 280,
              overflowY: 'auto',
            }}
          >
            <div style={{ padding: '6px 10px', fontSize: 11, color: '#A5ACAF' }}>Filter by department</div>
            {departments.map((d) => (
              <div
                key={d}
                role="option"
                aria-selected={deptFilter === d}
                onMouseDown={() => { setDeptFilter(d); setPersonFilter('All') }}
                style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer', color: deptFilter === d ? '#fff' : '#A5ACAF' }}
              >
                {d}
              </div>
            ))}
            <div style={{ padding: '6px 10px', fontSize: 11, color: '#A5ACAF', borderTop: '1px solid #0a3560' }}>Participants</div>
            <div
              role="option"
              aria-selected={personFilter === 'All'}
              onMouseDown={() => setPersonFilter('All')}
              style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer', color: personFilter === 'All' ? '#fff' : '#A5ACAF' }}
            >
              All participants
            </div>
            {comboMatches.map((p) => (
              <div
                key={p.id}
                role="option"
                aria-selected={personFilter === p.id}
                onMouseDown={() => { setPersonFilter(p.id); setComboQuery(`${p.first_name} ${p.last_name}`); setComboOpen(false) }}
                style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer', color: personFilter === p.id ? '#fff' : '#A5ACAF' }}
              >
                {p.first_name} {p.last_name} <span style={{ color: '#6b7580' }}>· {p.department}</span>
              </div>
            ))}
            {comboMatches.length === 0 && (
              <div style={{ padding: '6px 10px', fontSize: 12, color: '#6b7580' }}>No matching participants.</div>
            )}
          </div>
        </div>
      </div>

      {selected && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            background: '#001a33',
            border: '1px solid #0a3560',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 14,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{selected.first_name} {selected.last_name}</span>
              {selected.baseline_state === 'building' ? (
                <Badge variant="wolf">Building baseline</Badge>
              ) : (
                <Badge variant={selected.risk_level === 'High' ? 'red' : selected.risk_level === 'Medium' ? 'amber' : 'green'}>
                  {selected.risk_tier_label ?? selected.risk_level}
                </Badge>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#A5ACAF', marginTop: 4 }}>
              {[selected.department, selected.title].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Badge variant="wolf">ENGAGEMENT SCORE</Badge>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginTop: 4 }}>
              {selected.engagement_score ?? '—'}
              {engagementDeltaLabel(selected.engagement_score, cohortAverages.avgWeightedScore) && (
                <span style={{ fontSize: 12, fontWeight: 500, color: '#A5ACAF', marginLeft: 8 }}>
                  {engagementDeltaLabel(selected.engagement_score, cohortAverages.avgWeightedScore)}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

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
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Flag actions</div>
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
              </div>
            </>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: '#A5ACAF', marginBottom: 10 }}>Choose a participant to view risk tier, or review the cohort risk composition below.</div>
              {riskComposition.map((bucket) => (
                <BarRow
                  key={bucket.level}
                  label={bucket.label}
                  value={bucket.count}
                  max={Math.max(scopedParticipants.length, 1)}
                  color={bucket.color}
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
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

      <div style={{ marginTop: 14 }}>
        <Card title="Team Health Score Trend" badge={teamHealthScore?.current.lowConfidence ? <Badge variant="amber">low confidence</Badge> : undefined}>
          {!selected ? (
            <div>Choose a participant to view their Team Health Score trend.</div>
          ) : thsLoading ? (
            <ChartSkeleton height={210} />
          ) : thsError ? (
            <div style={{ color: '#ff6b6b', fontSize: 12 }}>{thsError}</div>
          ) : teamHealthScore ? (
            <>
              <div style={{ display: 'grid', gap: 4, marginBottom: 12, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#A5ACAF' }}>Baseline</span>
                  <span style={{ color: '#fff' }}>
                    {selected.baseline_state === 'building'
                      ? `Baseline building (${selected.baseline_days_remaining} days remaining)`
                      : teamHealthScore.baseline.composite != null ? teamHealthScore.baseline.composite : 'No data yet'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#A5ACAF' }}>Last week</span>
                  <span style={{ color: '#fff' }}>{teamHealthScore.lastWeek.composite != null ? teamHealthScore.lastWeek.composite : 'No data yet'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#A5ACAF' }}>Current</span>
                  <span style={{ color: '#fff' }}>{teamHealthScore.current.composite != null ? teamHealthScore.current.composite : 'No data yet'}</span>
                </div>
              </div>
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
      </div>

      <div style={{ marginTop: 14 }}>
        <Card title="5-Metric Breakdown">
          {!selected ? (
            <div>Choose a participant to view their 5-metric breakdown.</div>
          ) : thsLoading ? (
            <TableSkeleton columns={2} rows={5} />
          ) : thsError ? (
            <div style={{ color: '#ff6b6b', fontSize: 12 }}>{thsError}</div>
          ) : teamHealthScore ? (
            <>
              {THS_COMPONENT_KEYS.filter((key) => teamHealthScore.current[key] != null).length > 0 && (
                <WellnessDirectorCharts
                  type="recovery"
                  seriesName="Score"
                  data={THS_COMPONENT_KEYS.filter((key) => teamHealthScore.current[key] != null).map((key) => {
                    const value = teamHealthScore.current[key] as number
                    return {
                      name: THS_COMPONENT_LABELS[key],
                      value,
                      color: recoveryColor(value),
                    }
                  })}
                />
              )}
              {THS_COMPONENT_KEYS.filter((key) => teamHealthScore.current[key] == null).length > 0 && (
                <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                  {THS_COMPONENT_KEYS.filter((key) => teamHealthScore.current[key] == null).map((key) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                      <span style={{ color: '#A5ACAF' }}>{THS_COMPONENT_LABELS[key]}</span>
                      <span style={{ color: '#fff' }}>-- <span style={{ color: '#A5ACAF', fontStyle: 'italic' }}>(No data this window)</span></span>
                    </div>
                  ))}
                </div>
              )}
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

      <div style={{ marginTop: 14 }}>
        <Card
          title="Weekly response rate"
          badge={<Badge variant="wolf">{formatWindowLabel({ start: mostRecentCompletedMonday(), end: shiftDateStr(mostRecentCompletedMonday(), 6) })}</Badge>}
        >
          {weeklyResponseRateError ? (
            <div style={{ color: '#ff6b6b', fontSize: 12 }}>{weeklyResponseRateError}</div>
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', color: '#A5ACAF', fontWeight: 600, padding: '4px 6px' }}>Participant</th>
                    {WEEKDAY_LABELS.map((day) => (
                      <th key={day} style={{ color: '#A5ACAF', fontWeight: 600, padding: '4px 6px' }}>{day}</th>
                    ))}
                    <th style={{ color: '#A5ACAF', fontWeight: 600, padding: '4px 6px' }}>Week %</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyRowsToShow.map((p) => {
                    const row = weeklyResponseRateByParticipant.get(p.id)
                    const days = row?.days ?? Array.from<boolean | null>({ length: 7 }).fill(null)
                    return (
                      <tr key={p.id}>
                        <td style={{ padding: '4px 6px', color: '#fff' }}>{p.first_name} {p.last_name}</td>
                        {days.map((present, index) => (
                          <td key={index} style={{ textAlign: 'center', padding: '4px 6px', color: present ? '#69BE28' : '#6b7580' }}>
                            {present == null ? (weeklyResponseRateLoading ? '···' : '—') : present ? '✓' : '·'}
                          </td>
                        ))}
                        <td style={{ textAlign: 'center', padding: '4px 6px', color: '#fff' }}>{row ? `${row.week_pct}%` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 11, color: '#A5ACAF' }}>
                  Showing {weeklyRowsToShow.length} of {scopedParticipants.length}
                  {!weeklyShowAll && scopedParticipants.length > weeklyRowsToShow.length && (
                    <>
                      {' — '}
                      <button
                        type="button"
                        onClick={() => setWeeklyShowAll(true)}
                        style={{ background: 'none', border: 'none', color: '#69BE28', cursor: 'pointer', padding: 0, font: 'inherit' }}
                      >
                        view all {scopedParticipants.length}
                      </button>
                    </>
                  )}
                </div>
                <button className="btn-primary" type="button" disabled title="Export coming soon">
                  Export full list ({scopedParticipants.length})
                </button>
              </div>
            </>
          )}
        </Card>
      </div>

      {selected && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
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
          <Card title="Recent nudges & responses">
            {nudgeHistoryLoading ? (
              <TableSkeleton columns={2} rows={3} />
            ) : nudgeHistoryError ? (
              <div style={{ color: '#ff6b6b', fontSize: 12 }}>{nudgeHistoryError}</div>
            ) : nudgeHistory.length === 0 ? (
              <div>No nudges sent to this participant yet.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {nudgeHistory.map((entry) => (
                  <div key={entry.nudge_id} style={{ borderBottom: '1px solid #0a3560', paddingBottom: 6 }}>
                    <div style={{ fontSize: 12, color: '#fff' }}>{entry.message}</div>
                    <div style={{ fontSize: 11, color: '#A5ACAF', display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                      <span>Week of {entry.week_of}</span>
                      <Badge variant={entry.responded ? 'green' : 'amber'}>{entry.responded ? 'Replied' : 'No response yet'}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              <a href="/wellness-director/events" style={{ fontSize: 12, color: '#69BE28' }}>Full history →</a>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}
