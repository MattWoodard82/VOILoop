'use client'

import { useState } from 'react'
import { Badge, Card } from '@/components/ui'

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
  const nextResults: DiagnosticResult[] = []
  const nextRaw: Record<string, unknown> = {}

  for (const metric of METRICS) {
    try {
      const response = await fetch(`/api/participant/ranking?metric=${metric}`, { credentials: 'include' })
      const body = await response.json().catch(() => ({})) as RankingPayload
      nextRaw[metric] = { status: response.status, body }

      const context = body.context
      const ok = response.status === 200
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
          ? `200 OK. Rank ${context?.participant_rank} of ${context?.cohort_size}.`
          : `Expected 200 + privacy-safe context, got ${response.status}.`,
      })
    } catch (error) {
      nextResults.push({
        name: `Ranking metric: ${metric}`,
        ok: false,
        detail: error instanceof Error ? error.message : 'Request failed.',
      })
    }
  }

  try {
    const response = await fetch('/api/participant/ranking?metric=foo', { credentials: 'include' })
    const body = await response.json().catch(() => ({})) as RankingPayload
    nextRaw.invalid_metric = { status: response.status, body }
    nextResults.push({
      name: 'Ranking invalid metric rejected',
      ok: response.status === 400 && body.error === 'Invalid metric.',
      detail: response.status === 400
        ? '400 Bad Request returned as expected.'
        : `Expected 400, got ${response.status}.`,
    })
  } catch (error) {
    nextResults.push({
      name: 'Ranking invalid metric rejected',
      ok: false,
      detail: error instanceof Error ? error.message : 'Request failed.',
    })
  }

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

    setResults(ranking.results)
    setRawResponses(ranking.rawResponses)
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
          Runs participant-facing diagnostics for the currently signed-in user. This currently includes the Priority 1 privacy-safe ranking checks and invalid-metric handling.
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
