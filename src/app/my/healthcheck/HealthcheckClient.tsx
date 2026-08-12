'use client'

import { useState } from 'react'
import { Badge, Card } from '@/components/ui'
import { buildParticipantInsights } from '../insights'
import type { DailyWellness, Workout } from '@/types'

type Metric = 'recovery' | 'workouts_logged' | 'points_earned' | 'consistency_streak'

type DiagnosticResult = {
  name: string
  ok: boolean
  detail: string
}

type RankingPayload = {
  context?: {
    metric?: string
    metric_label?: string
    participant_rank?: number
    cohort_size?: number
    cohort_percentile?: number
    comparison_text?: string
    rank_context?: {
      ahead?: number
      behind?: number
    }
    [key: string]: unknown
  }
  error?: string
  [key: string]: unknown
}

const METRICS: Metric[] = ['recovery', 'workouts_logged', 'points_earned', 'consistency_streak']

function wellness(date: string, recovery: number | null, hrv: number | null, restingHr: number | null): DailyWellness {
  return {
    id: `w-${date}`,
    participant_id: 'P1',
    source_batch_id: null,
    date,
    recovery_score: recovery,
    hrv_ms: hrv,
    resting_hr: restingHr,
    blood_oxygen: null,
    skin_temp: null,
    day_strain: null,
    calories: null,
    sleep_perf: null,
    sleep_hrs: null,
    sleep_debt: null,
    sleep_need: null,
    deep_sleep: null,
    rem_sleep: null,
    light_sleep: null,
    sleep_eff: null,
    sleep_consistency: null,
    resp_rate: null,
  }
}

function workout(date: string, duration: number | null): Workout {
  return {
    id: `k-${date}-${duration}`,
    participant_id: 'P1',
    source_batch_id: null,
    date,
    start_time: `${date}T08:00:00Z`,
    end_time: null,
    activity: 'Run',
    duration_min: duration,
    strain: null,
    calories: null,
    max_hr: null,
    avg_hr: null,
    zone1_pct: null,
    zone2_pct: null,
    zone3_pct: null,
    zone4_pct: null,
    zone5_pct: null,
  }
}

function hasNoPeerIdentityLeak(payload: RankingPayload) {
  const text = JSON.stringify(payload)
  return !(
    text.includes('first_name')
    || text.includes('last_name')
    || text.includes('"participants"')
    || text.includes('Colin')
    || text.includes('Stephenson')
    || text.includes('EMP')
  )
}

async function runRankingDiagnostics() {
  const response = await fetch('/api/diagnostic/participant-ranking', { credentials: 'include' })
  const payload = await response.json().catch(() => ({})) as {
    participant_email?: string
    results?: Record<string, { status?: number; body?: RankingPayload }>
    error?: string
  }

  const nextResults: DiagnosticResult[] = []
  const nextRaw: Record<string, unknown> = {
    participant_email: payload.participant_email ?? null,
    diagnostic_status: response.status,
    diagnostic_error: payload.error ?? null,
  }

  if (!response.ok || !payload.results) {
    nextResults.push({
      name: 'Ranking diagnostic bootstrap',
      ok: false,
      detail: payload.error ?? `Expected 200 from admin diagnostic endpoint, got ${response.status}.`,
    })
    return { results: nextResults, rawResponses: nextRaw }
  }

  for (const metric of METRICS) {
    const metricResult = payload.results[metric]
    const body = (metricResult?.body ?? {}) as RankingPayload
    nextRaw[metric] = metricResult ?? null

    const context = body.context
    const ok = metricResult?.status === 200
      && !!context
      && typeof context.participant_rank === 'number'
      && typeof context.cohort_size === 'number'
      && typeof context.cohort_percentile === 'number'
      && typeof context.comparison_text === 'string'
      && hasNoPeerIdentityLeak(body)

    nextResults.push({
      name: `Ranking metric: ${metric}`,
      ok,
      detail: ok
        ? `200 OK for ${payload.participant_email}. Rank ${context?.participant_rank} of ${context?.cohort_size}.`
        : `Expected 200 + privacy-safe context, got ${metricResult?.status ?? 'unknown'}.`,
    })
  }

  const invalidMetricResult = payload.results.invalid_metric
  nextRaw.invalid_metric = invalidMetricResult ?? null
  nextResults.push({
    name: 'Ranking invalid metric rejected',
    ok: invalidMetricResult?.status === 400 && invalidMetricResult.body?.error === 'Invalid metric.',
    detail: invalidMetricResult?.status === 400
      ? '400 Bad Request returned as expected.'
      : `Expected 400, got ${invalidMetricResult?.status ?? 'unknown'}.`,
  })

  return { results: nextResults, rawResponses: nextRaw }
}

async function runPrivacyAndAccessDiagnostics() {
  const nextResults: DiagnosticResult[] = []
  const nextRaw: Record<string, unknown> = {}

  const rankingForbiddenResponse = await fetch('/api/participant/ranking?metric=recovery', { credentials: 'include' })
  const rankingForbiddenBody = await rankingForbiddenResponse.json().catch(() => ({})) as Record<string, unknown>
  nextRaw.admin_ranking_probe = {
    status: rankingForbiddenResponse.status,
    body: rankingForbiddenBody,
  }
  nextResults.push({
    name: 'Step 29: admin blocked from participant ranking API',
    ok: rankingForbiddenResponse.status === 403,
    detail: rankingForbiddenResponse.status === 403
      ? 'Admin session correctly receives 403 from participant ranking.'
      : `Expected 403, got ${rankingForbiddenResponse.status}.`,
  })

  const configResponse = await fetch('/api/admin/wellness-director-config', { credentials: 'include' })
  const configBody = await configResponse.json().catch(() => ({})) as Record<string, unknown>
  nextRaw.admin_config_probe = {
    status: configResponse.status,
    body: configBody,
  }
  nextResults.push({
    name: 'Step 30: admin-only Wellness Director config present',
    ok: configResponse.status === 200 && typeof configBody.config === 'object' && configBody.config != null,
    detail: configResponse.status === 200
      ? 'Admin config route returned Wellness Director weights.'
      : `Expected 200 for admin healthcheck session, got ${configResponse.status}.`,
  })

  const requiredWeightKeys = [
    'login_frequency_weight',
    'pulse_survey_completion_weight',
    'data_submission_weight',
    'intervention_follow_up_weight',
    'trend_consistency_weight',
  ]
  const weights = (configBody.config as { weights?: Record<string, unknown> } | undefined)?.weights ?? {}
  const weightKeysPresent = requiredWeightKeys.every((key) => key in weights)
  nextResults.push({
    name: 'Step 31: engagement score weights storage provisioned',
    ok: configResponse.status === 200 && weightKeysPresent,
    detail: weightKeysPresent
      ? `Found ${requiredWeightKeys.length} expected weight keys in admin config.`
      : 'Expected all engagement score weight keys to be available.',
  })

  return { results: nextResults, rawResponses: nextRaw }
}

function runPriority4Diagnostics() {
  const nextResults: DiagnosticResult[] = []
  const nextRaw: Record<string, unknown> = {}

  const wellnessData = [
    wellness('2024-06-21', 80, 75, 54),
    wellness('2024-06-20', 78, 73, 55),
    wellness('2024-06-19', 77, 72, 56),
    wellness('2024-06-18', 76, 71, 55),
    wellness('2024-06-17', 75, 70, 54),
    wellness('2024-05-31', 60, 60, 60),
    wellness('2024-05-30', 61, 59, 61),
    wellness('2024-05-29', 62, 58, 62),
    wellness('2024-05-28', 63, 57, 63),
    wellness('2024-05-27', 64, 56, 64),
  ]

  const workoutData = [
    workout('2024-06-21', 60),
    workout('2024-06-20', 55),
    workout('2024-06-19', 50),
    workout('2024-06-18', 52),
    workout('2024-05-31', 30),
    workout('2024-05-30', 30),
  ]

  const insights = buildParticipantInsights(wellnessData, workoutData)
  nextRaw.priority4_sample = insights

  nextResults.push({
    name: 'Priority 4 baseline comparisons',
    ok: insights.baselineComparisons.length === 5
      && insights.baselineComparisons.some((row) => row.metric === 'Exercise duration')
      && insights.baselineComparisons.some((row) => row.metric === 'Workouts logged')
      && insights.baselineComparisons.some((row) => row.metric === 'Recovery score')
      && insights.baselineComparisons.some((row) => row.metric === 'HRV')
      && insights.baselineComparisons.some((row) => row.metric === 'Resting HR'),
    detail: `Found ${insights.baselineComparisons.length} baseline comparison cards.`,
  })

  nextResults.push({
    name: 'Priority 4 streaks',
    ok: insights.streaks.length >= 2
      && insights.streaks.some((row) => row.label === 'Workout days streak')
      && insights.streaks.some((row) => row.label === 'Green recovery streak'),
    detail: `Found ${insights.streaks.length} streak summaries.`,
  })

  nextResults.push({
    name: 'Priority 4 personal bests',
    ok: insights.bests.length >= 3
      && insights.bests.some((row) => row.label === 'Longest workout')
      && insights.bests.some((row) => row.label === 'Top recovery')
      && insights.bests.some((row) => row.label === 'Top HRV'),
    detail: `Found ${insights.bests.length} personal best entries.`,
  })

  nextResults.push({
    name: 'Priority 4 trends',
    ok: insights.trends.length >= 4
      && insights.trends.some((row) => row.label === 'Workout duration')
      && insights.trends.some((row) => row.label === 'Recovery score')
      && insights.trends.some((row) => row.label === 'HRV')
      && insights.trends.some((row) => row.label === 'Resting HR'),
    detail: `Found ${insights.trends.length} trend entries.`,
  })

  const noDataInsights = buildParticipantInsights(
    [
      wellness('2024-06-21', null, null, null),
      wellness('2024-05-31', null, null, null),
    ],
    [workout('2024-06-21', null)],
  )
  nextRaw.priority4_no_data = noDataInsights

  nextResults.push({
    name: 'Priority 4 no-data fallback',
    ok: noDataInsights.baselineComparisons.every((row) => row.state === 'insufficient')
      && noDataInsights.trends.every((row) => row.state === 'insufficient')
      && noDataInsights.bests.some((row) => row.label === 'Longest workout' && row.value === 'No data'),
    detail: 'No-data insights return insufficient states and no-data best labels.',
  })

  return { results: nextResults, rawResponses: nextRaw }
}

export function HealthcheckClient() {
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<DiagnosticResult[]>([])
  const [rawResponses, setRawResponses] = useState<Record<string, unknown>>({})

  async function runDiagnostics() {
    setRunning(true)
    setResults([])
    setRawResponses({})

    const ranking = await runRankingDiagnostics()
    const priority4 = runPriority4Diagnostics()
    const privacy = await runPrivacyAndAccessDiagnostics()

    setResults([...ranking.results, ...priority4.results, ...privacy.results])
    setRawResponses({ ...ranking.rawResponses, ...priority4.rawResponses, ...privacy.rawResponses })
    setRunning(false)
  }

  const passed = results.filter((result) => result.ok).length
  const failed = results.filter((result) => !result.ok).length

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card
        title="Participant healthcheck"
        badge={<Badge variant={failed > 0 ? 'red' : passed > 0 ? 'green' : 'wolf'}>{results.length === 0 ? 'Idle' : `${passed} passed / ${failed} failed`}</Badge>}
      >
        <div style={{ fontSize: 12, color: '#A5ACAF', marginBottom: 12, lineHeight: 1.6 }}>
          Runs admin healthchecks covering Priority 1 privacy-safe ranking checks, Priority 4 personal baseline/streaks/bests/trends validations, and access/storage probes for manual steps 29-31.
        </div>
        <button
          onClick={runDiagnostics}
          disabled={running}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: 'none',
            background: running ? '#0a3560' : '#69BE28',
            color: running ? '#A5ACAF' : '#002244',
            fontWeight: 700,
            cursor: running ? 'default' : 'pointer',
          }}
        >
          {running ? 'Running…' : 'Run healthcheck'}
        </button>
      </Card>

      {results.length > 0 ? (
        <Card title="Results">
          <div style={{ display: 'grid', gap: 10 }}>
            {results.map((result) => (
              <div
                key={result.name}
                style={{
                  border: `1px solid ${result.ok ? 'rgba(105,190,40,0.35)' : 'rgba(255,107,107,0.35)'}`,
                  background: result.ok ? 'rgba(105,190,40,0.08)' : 'rgba(255,107,107,0.08)',
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{result.name}</div>
                  <Badge variant={result.ok ? 'green' : 'red'}>{result.ok ? 'PASS' : 'FAIL'}</Badge>
                </div>
                <div style={{ fontSize: 12, color: '#A5ACAF' }}>{result.detail}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {Object.keys(rawResponses).length > 0 ? (
        <Card title="Raw responses">
          <pre
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: 11,
              color: '#A5ACAF',
              background: '#001a33',
              border: '1px solid #0a3560',
              borderRadius: 8,
              padding: 12,
            }}
          >
            {JSON.stringify(rawResponses, null, 2)}
          </pre>
        </Card>
      ) : null}
    </div>
  )
}
