'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts'
import { Alert, Badge, Card, KpiCard } from '@/components/ui'
import { formatDate, recoveryColor, sleepColor } from '@/lib/utils'
import type { DailyWellness, Participant, Habit, ImportBatch, PulseSurvey, Workout } from '@/types'
import { EventsNudgeCard } from '@/components/EventsNudgeCard'
import type { BaselineComparison, PersonalBest, PersonalStreak, PersonalTrend } from './insights'
import Link from 'next/link'

function isThisWeek(dateStr: string): boolean {
  // Server stores dates as UTC ISO strings (new Date().toISOString().slice(0,10)).
  // Use UTC day arithmetic so week boundaries match regardless of browser timezone.
  const now = new Date()
  const utcDay = now.getUTCDay() // 0=Sun, 1=Mon...
  const diffToMonday = utcDay === 0 ? -6 : 1 - utcDay
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diffToMonday))
  const sunday = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6, 23, 59, 59, 999))
  // dateStr is YYYY-MM-DD; parse as UTC midnight to match server convention
  const d = new Date(dateStr + 'T00:00:00Z')
  return d >= monday && d <= sunday
}

interface Props {
  participant: Participant
  wellness: DailyWellness[]
  habits: Habit | null
  workout: Workout | null
  pulse: PulseSurvey[]
  insights: {
    baselineComparisons: BaselineComparison[]
    streaks: PersonalStreak[]
    bests: PersonalBest[]
    trends: PersonalTrend[]
    window: {
      recentStart: string
      recentEnd: string
      baselineStart: string
      baselineEnd: string
    } | null
  }
  challenge: {
    visibility_state: 'none' | 'ineligible' | 'eligible'
    data: {
      id: string
      name: string
      threshold_value: number
      progress_value: number
      completed: boolean
      completed_at: string | null
      last_computed_at: string | null
      status: 'active' | 'cancelled' | 'completed' | 'draft'
    } | null
  } | null
  importBatches: ImportBatch[]
}

function getRecoverySummary(score: number | null) {
  if (score == null) {
    return { label: 'No recovery data yet', detail: 'Upload a WHOOP export to populate your dashboard.' }
  }

  if (score >= 67) {
    return { label: 'Green recovery', detail: 'You look ready for a higher-load day.' }
  }

  if (score >= 34) {
    return { label: 'Yellow recovery', detail: 'Moderate readiness. Keep an eye on sleep debt and strain.' }
  }

  return { label: 'Red recovery', detail: 'Recovery is low today. Prioritize rest and lower-intensity activity.' }
}

function recoveryBadgeVariant(score: number | null): 'green' | 'amber' | 'red' | 'wolf' {
  if (score == null) return 'wolf'
  if (score >= 67) return 'green'
  if (score >= 34) return 'amber'
  return 'red'
}

function statusVariant(status: ImportBatch['status']) {
  if (status === 'completed') return 'green'
  if (status === 'partial' || status === 'processing' || status === 'pending') return 'amber'
  return 'red'
}

function statusLabel(status: ImportBatch['status']) {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function MetricRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid #0a3560', fontSize: 12 }}>
      <span style={{ color: '#A5ACAF' }}>{label}</span>
      <strong style={{ color: '#fff', textAlign: 'right' }}>{value}</strong>
    </div>
  )
}

function HabitBadge({ label, value }: { label: string; value: boolean | null }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        border: `1px solid ${value ? 'rgba(105,190,40,0.3)' : '#0a3560'}`,
        background: value ? 'rgba(105,190,40,0.1)' : '#001a33',
        color: value ? '#69BE28' : '#A5ACAF',
        fontSize: 11,
        marginRight: 6,
        marginBottom: 6,
      }}
    >
      <span>{value ? '✓' : '–'}</span>
      {label}
    </span>
  )
}

function baselineBadgeVariant(state: BaselineComparison['state']) {
  if (state === 'improved') return 'green'
  if (state === 'declined') return 'red'
  if (state === 'flat') return 'amber'
  return 'wolf'
}

function trendBadgeVariant(state: PersonalTrend['state']) {
  if (state === 'up') return 'green'
  if (state === 'down') return 'red'
  if (state === 'flat') return 'amber'
  return 'wolf'
}

export function MyDashboardClient({ participant, wellness, habits, workout, pulse, challenge, importBatches, insights }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pulseDoneBanner, setPulseDoneBanner] = useState(false)

  useEffect(() => {
    if (searchParams.get('pulse_done') === '1') {
      setPulseDoneBanner(true)
      const url = new URL(window.location.href)
      url.searchParams.delete('pulse_done')
      router.replace(url.pathname + (url.search || ''))
    }
  }, [searchParams, router])

  const latest = wellness[0] ?? null
  const latestPulse = pulse[0] ?? null
  const latestImport = importBatches[0] ?? null
  const recoverySummary = getRecoverySummary(latest?.recovery_score ?? null)
  const pulseCompletedThisWeek = latestPulse ? isThisWeek(latestPulse.date) : false

  const trendData = [...wellness]
    .reverse()
    .map((entry) => ({
      date: entry.date.slice(5),
      recovery: entry.recovery_score,
      sleep: entry.sleep_perf,
      strain: entry.day_strain,
    }))

  const pulseTrendData = [...pulse]
    .reverse()
    .map((entry) => ({
      date: entry.date.slice(5),
      mental_wellbeing: entry.mental_wellbeing,
      energy_level: entry.energy_level,
      stress_level: entry.stress_level,
    }))

  const importSyncLabel = latestImport?.completed_at
    ? formatDate(latestImport.completed_at)
    : latestImport?.started_at
      ? formatDate(latestImport.started_at)
      : latest?.date
        ? formatDate(latest.date)
        : null

  return (
    <div>
      {pulseDoneBanner && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            background: '#0d2e0a',
            border: '1px solid #69BE28',
            borderRadius: 10,
            padding: '14px 20px',
            marginBottom: 18,
            fontSize: 14,
            color: '#69BE28',
            fontWeight: 600,
          }}
        >
          <span>✅ This week&apos;s Pulse Survey has been completed — thank you!</span>
          <button
            onClick={() => setPulseDoneBanner(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#69BE28', fontSize: 18, lineHeight: 1, padding: 0 }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {!pulseCompletedThisWeek && (
        <div
          style={{
            background: '#001a33',
            border: '2px solid #69BE28',
            borderRadius: 12,
            padding: '20px 24px',
            marginBottom: 18,
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ minWidth: 0, flex: '1 1 200px' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
              📋 This week&apos;s Pulse Survey is ready
            </div>
            <div style={{ fontSize: 13, color: '#A5ACAF', lineHeight: 1.5 }}>
              10 questions · under 3 minutes · your responses are private and go only to your Wellness Director.
            </div>
          </div>
          <Link
            href="/survey"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '14px 28px',
              borderRadius: 10,
              border: 'none',
              background: '#69BE28',
              color: '#002244',
              fontSize: 15,
              fontWeight: 700,
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            Take the survey →
          </Link>
        </div>
      )}

      {!latest ? (
        <Alert variant="warn">
          <strong style={{ color: '#fff' }}>Your dashboard is waiting for data.</strong> Upload a WHOOP export to populate recovery, sleep, strain, and habit insights.
        </Alert>
      ) : null}

      <div
        style={{
          background: '#002244',
          border: `1px solid ${recoveryColor(latest?.recovery_score ?? null)}`,
          borderRadius: 12,
          padding: '20px 24px',
          marginBottom: 18,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 20,
          alignItems: 'flex-start',
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {participant.first_name}
          </div>
          <div style={{ fontSize: 13, color: '#A5ACAF', marginBottom: 12 }}>
            {participant.department} · {participant.title}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: recoveryColor(latest?.recovery_score ?? null), marginBottom: 4 }}>
            {recoverySummary.label}
          </div>
          <div style={{ fontSize: 12, color: '#A5ACAF', maxWidth: 560, lineHeight: 1.6 }}>
            {recoverySummary.detail}
          </div>
          {pulseCompletedThisWeek && (
            <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: '#0d2e0a', border: '1px solid #69BE28', fontSize: 12, color: '#69BE28', fontWeight: 600 }}>
              ✅ Pulse Survey completed this week
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
          <Badge variant={recoveryBadgeVariant(latest?.recovery_score ?? null)}>
            Recovery {latest?.recovery_score ?? '—'}
          </Badge>
          <Badge variant="wolf">
            {importSyncLabel ? `Last sync ${importSyncLabel}` : 'No sync yet'}
          </Badge>
          {participant.is_exact_data ? <Badge variant="green">Exact WHOOP data</Badge> : null}
        </div>
      </div>
<EventsNudgeCard />
      {challenge && challenge.visibility_state !== 'none' && challenge.data ? (
        <Card title="Challenge progress" badge={<Badge variant={challenge.data.completed ? 'green' : 'wolf'}>{challenge.data.completed ? 'Completed' : challenge.data.status === 'active' ? 'Active' : 'Not completed'}</Badge>}>
          <div style={{ fontSize: 12, color: '#A5ACAF', marginBottom: 8, lineHeight: 1.5 }}>
            <strong style={{ color: '#fff' }}>{challenge.data.name}</strong>
          </div>
          {challenge.visibility_state === 'ineligible' ? (
            <div style={{ fontSize: 12, color: '#A5ACAF' }}>
              You are not eligible for the current challenge.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: '#A5ACAF', marginBottom: 8 }}>
                Progress: <strong style={{ color: '#fff' }}>{challenge.data.progress_value}</strong> / {challenge.data.threshold_value}
              </div>
              <div style={{ height: 8, background: '#0a3560', borderRadius: 999, overflow: 'hidden', marginBottom: 8 }}>
                <div
                  style={{
                    width: `${Math.min((challenge.data.progress_value / challenge.data.threshold_value) * 100, 100)}%`,
                    height: '100%',
                    background: challenge.data.completed ? '#69BE28' : '#378ADD',
                  }}
                />
              </div>
              <div style={{ fontSize: 11, color: challenge.data.completed ? '#69BE28' : '#A5ACAF' }}>
                {challenge.data.completed
                  ? `Completed ${challenge.data.completed_at ? new Date(challenge.data.completed_at).toLocaleString() : ''}`
                  : 'In progress'}
                {challenge.data.last_computed_at ? ` · Updated ${new Date(challenge.data.last_computed_at).toLocaleString()}` : ''}
              </div>
            </>
          )}
        </Card>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
        <KpiCard
          label="Recovery score"
          value={latest?.recovery_score ?? '—'}
          color={recoveryColor(latest?.recovery_score ?? null)}
          delta={latest?.date ? `Updated ${formatDate(latest.date)}` : 'Waiting for upload'}
          deltaDir="neutral"
        />
        <KpiCard
          label="Sleep performance"
          value={latest?.sleep_perf != null ? `${latest.sleep_perf}%` : '—'}
          color={sleepColor(latest?.sleep_perf ?? null)}
          delta={latest?.sleep_debt != null ? `${latest.sleep_debt} hrs sleep debt` : 'No sleep debt data'}
          deltaDir={(latest?.sleep_debt ?? 0) > 1 ? 'down' : 'neutral'}
        />
        <KpiCard
          label="HRV"
          value={latest?.hrv_ms != null ? `${latest.hrv_ms} ms` : '—'}
          color="#69BE28"
          delta={latest?.resting_hr != null ? `Resting HR ${latest.resting_hr} bpm` : 'No HR data'}
          deltaDir="neutral"
        />
        <KpiCard
          label="Day strain"
          value={latest?.day_strain ?? '—'}
          color={(latest?.day_strain ?? 0) > 14 ? '#ff6b6b' : (latest?.day_strain ?? 0) > 10 ? '#FFA500' : '#69BE28'}
          delta={workout?.activity ? `Latest workout: ${workout.activity}` : 'No workout logged'}
          deltaDir="neutral"
        />
      </div>

      <Card
        title="Your baseline vs recent 21 days"
        badge={insights.window ? <Badge variant="wolf">{insights.window.baselineStart}–{insights.window.baselineEnd} vs {insights.window.recentStart}–{insights.window.recentEnd}</Badge> : undefined}
      >
        {insights.baselineComparisons.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            {insights.baselineComparisons.map((comparison) => (
              <div key={comparison.metric} className="rounded-lg border border-[#0a3560] bg-[#001a33] p-3">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.05em] text-[#A5ACAF]">{comparison.metric}</div>
                <div className="mb-0.5 text-xs text-white">Recent: {comparison.currentLabel}</div>
                <div className="mb-2 text-[11px] text-[#A5ACAF]">Baseline: {comparison.baselineLabel}</div>
                <Badge variant={baselineBadgeVariant(comparison.state)}>{comparison.deltaLabel}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: '#A5ACAF', lineHeight: 1.6 }}>
            Need more recent wellness and workout data before baseline comparisons can be shown.
          </div>
        )}
      </Card>

      <div className="my-3 grid gap-4 xl:grid-cols-3">
        <Card title="Personal streaks">
          {insights.streaks.map((streak) => (
            <MetricRow key={streak.label} label={streak.label} value={streak.value} />
          ))}
        </Card>
        <Card title="Personal bests">
          {insights.bests.map((best) => (
            <MetricRow key={best.label} label={best.label} value={`${best.value} (${best.date})`} />
          ))}
        </Card>
        <Card title="Personal trends">
          {insights.trends.length > 0 ? (
            insights.trends.map((trend) => (
              <div key={trend.label} className="flex gap-3 border-b border-[#0a3560] py-2 text-xs">
                <span className="flex-1 text-[#A5ACAF]">{trend.label}</span>
                <Badge variant={trendBadgeVariant(trend.state)}>{trend.value}</Badge>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 12, color: '#A5ACAF', lineHeight: 1.6 }}>
              Need more recent wellness data before personal trends can be shown.
            </div>
          )}
        </Card>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 14, marginBottom: 14 }}>
        <Card title="Recovery and sleep trend">
          {trendData.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                <CartesianGrid stroke="rgba(10,53,96,0.6)" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: '#A5ACAF', fontSize: 10, fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#A5ACAF', fontSize: 10, fontFamily: 'Inter' }} axisLine={false} tickLine={false} width={28} domain={[0, 100]} />
                <Tooltip contentStyle={{ background: '#001a33', border: '1px solid #0a3560', borderRadius: 6, fontSize: 11 }} labelStyle={{ color: '#fff' }} />
                <Line type="monotone" dataKey="recovery" stroke="#69BE28" strokeWidth={2} dot={{ r: 3, fill: '#69BE28' }} name="Recovery" />
                <Line type="monotone" dataKey="sleep" stroke="#378ADD" strokeWidth={2} dot={{ r: 3, fill: '#378ADD' }} strokeDasharray="4 3" name="Sleep %" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ fontSize: 12, color: '#A5ACAF', lineHeight: 1.6 }}>
              You need at least two wellness records before a recovery trend appears.
            </div>
          )}
        </Card>

        <Card title="Latest detail">
          <MetricRow label="Resting heart rate" value={latest?.resting_hr != null ? `${latest.resting_hr} bpm` : '—'} />
          <MetricRow label="Deep sleep" value={latest?.deep_sleep != null ? `${latest.deep_sleep} hrs` : '—'} />
          <MetricRow label="REM sleep" value={latest?.rem_sleep != null ? `${latest.rem_sleep} hrs` : '—'} />
          <MetricRow label="Respiratory rate" value={latest?.resp_rate != null ? `${latest.resp_rate} rpm` : '—'} />
          <MetricRow label="Blood oxygen" value={latest?.blood_oxygen != null ? `${latest.blood_oxygen}%` : '—'} />
          <MetricRow label="Calories" value={latest?.calories != null ? `${latest.calories}` : '—'} />
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <Card title="Latest habits">
          {habits ? (
            <>
              <div style={{ marginBottom: 8 }}>
                <HabitBadge label="Hydrated" value={habits.hydrated} />
                <HabitBadge label="Protein" value={habits.protein} />
                <HabitBadge label="Caffeine" value={habits.caffeine} />
                <HabitBadge label="Ate late" value={habits.ate_late} />
                <HabitBadge label="Alcohol" value={habits.alcohol} />
                <HabitBadge label="Magnesium" value={habits.magnesium} />
                <HabitBadge label="Creatine" value={habits.creatine} />
                <HabitBadge label="Dimmed lights" value={habits.dimmed_lights} />
                <HabitBadge label="Read before bed" value={habits.read_before_bed} />
              </div>
              {habits.notes ? (
                <div style={{ marginTop: 12, padding: '10px 12px', background: '#001a33', border: '1px solid #0a3560', borderRadius: 8, fontSize: 12, color: '#A5ACAF', lineHeight: 1.6 }}>
                  {habits.notes}
                </div>
              ) : null}
            </>
          ) : (
            <div style={{ fontSize: 12, color: '#A5ACAF' }}>No habit data has been uploaded yet.</div>
          )}
        </Card>

        <Card title="Latest workout">
          {workout ? (
            <>
              <MetricRow label="Activity" value={workout.activity || '—'} />
              <MetricRow label="Date" value={formatDate(workout.date)} />
              <MetricRow label="Duration" value={workout.duration_min != null ? `${workout.duration_min} min` : '—'} />
              <MetricRow label="Strain" value={workout.strain != null ? String(workout.strain) : '—'} />
              <MetricRow label="Calories" value={workout.calories != null ? String(workout.calories) : '—'} />
              <MetricRow label="Heart rate" value={workout.avg_hr != null ? `${workout.avg_hr} avg / ${workout.max_hr ?? '—'} max bpm` : '—'} />
              {workout.zone1_pct != null && (
                <MetricRow
                  label="HR zones (Z1–Z5)"
                  value={[
                    workout.zone1_pct != null ? `${workout.zone1_pct}%` : '—',
                    workout.zone2_pct != null ? `${workout.zone2_pct}%` : '—',
                    workout.zone3_pct != null ? `${workout.zone3_pct}%` : '—',
                    workout.zone4_pct != null ? `${workout.zone4_pct}%` : '—',
                    workout.zone5_pct != null ? `${workout.zone5_pct}%` : '—',
                  ].join(' · ')}
                />
              )}
            </>
          ) : (
            <div style={{ fontSize: 12, color: '#A5ACAF' }}>No workout data has been uploaded yet.</div>
          )}
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <Card title="Pulse check-ins" badge={<Badge variant="wolf">{pulse.length} recent</Badge>}>
          {latestPulse ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: pulseTrendData.length > 1 ? 16 : 0 }}>
                {[
                  { label: 'Mental Wellbeing', value: latestPulse.mental_wellbeing },
                  { label: 'Energy Level', value: latestPulse.energy_level },
                  { label: 'Stress Level', value: latestPulse.stress_level },
                ].map((item) => {
                  const numericValue = item.value ?? null
                  const isStress = item.label === 'Stress Level'
                  const color = numericValue == null ? '#A5ACAF' : 
                    isStress ? (numericValue <= 2 ? '#69BE28' : numericValue <= 3 ? '#FFA500' : '#ff6b6b') :
                    (numericValue >= 4 ? '#69BE28' : numericValue >= 3 ? '#FFA500' : '#ff6b6b')

                  return (
                    <div key={item.label} style={{ background: '#001a33', border: '1px solid #0a3560', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, color: '#A5ACAF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 700, color }}>
                        {numericValue ?? '—'}
                        <span style={{ fontSize: 10, color: '#A5ACAF', marginLeft: 2 }}>/5</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {pulseTrendData.length > 1 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={pulseTrendData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                    <CartesianGrid stroke="rgba(10,53,96,0.6)" strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fill: '#A5ACAF', fontSize: 10, fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#A5ACAF', fontSize: 10, fontFamily: 'Inter' }} axisLine={false} tickLine={false} width={28} domain={[0, 5]} />
                    <Tooltip contentStyle={{ background: '#001a33', border: '1px solid #0a3560', borderRadius: 6, fontSize: 11 }} labelStyle={{ color: '#fff' }} />
                    <Line type="monotone" dataKey="mental_wellbeing" stroke="#69BE28" strokeWidth={2} dot={{ r: 3, fill: '#69BE28' }} name="Mental Wellbeing" />
                    <Line type="monotone" dataKey="energy_level" stroke="#378ADD" strokeWidth={2} dot={{ r: 3, fill: '#378ADD' }} strokeDasharray="4 3" name="Energy Level" />
                    <Line type="monotone" dataKey="stress_level" stroke="#ff6b6b" strokeWidth={2} dot={{ r: 3, fill: '#ff6b6b' }} name="Stress Level" />
                  </LineChart>
                </ResponsiveContainer>
              ) : null}
            </>
          ) : (
            <div style={{ fontSize: 12, color: '#A5ACAF', lineHeight: 1.6 }}>
              No pulse survey responses are available yet.
            </div>
          )}
        </Card>

        <Card title="Import history" badge={<Badge variant="wolf">{importBatches.length} recent</Badge>}>
          {importBatches.length > 0 ? (
            <>
              {importBatches.map((batch) => (
                <div key={batch.id} style={{ padding: '10px 0', borderBottom: '1px solid #0a3560' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Your workout, sleep, and recovery data
                    </div>
                    <Badge variant={statusVariant(batch.status)}>{statusLabel(batch.status)}</Badge>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11, color: '#A5ACAF' }}>
                    <span>{formatDate(batch.completed_at ?? batch.started_at)}</span>
                    <span>
                      ✓ Your data was received
                    </span>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div style={{ fontSize: 12, color: '#A5ACAF', lineHeight: 1.6 }}>
              You have not uploaded a WHOOP workbook yet.
            </div>
          )}
        </Card>
      </div>

      <Card title="WHOOP upload management">
        <div style={{ fontSize: 12, color: '#A5ACAF', marginBottom: 16, lineHeight: 1.6 }}>
          WHOOP uploads are handled by your administrator during this pilot phase.
        </div>
      </Card>
    </div>
  )
}
