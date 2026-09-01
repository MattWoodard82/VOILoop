'use client'

import { useEffect, useState } from 'react'

function formatWindowLabel(start: string, end: string) {
  return `${start} – ${end}`
}

// Team Health Score (GH #119) baseline window is set for the whole cohort,
// admin-only. Wellness Directors see this same window read-only, for
// visibility, on their dashboard.
export function TeamHealthScoreBaselineAdminClient() {
  const [config, setConfig] = useState<{ baselineStart: string; baselineEnd: string } | null>(null)
  const [draft, setDraft] = useState({ baseline_start: '', baseline_end: '' })
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/team-health-score-config')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        const loadedConfig = data?.config
        if (loadedConfig) {
          setConfig({ baselineStart: loadedConfig.baselineStart, baselineEnd: loadedConfig.baselineEnd })
          setDraft({ baseline_start: loadedConfig.baselineStart, baseline_end: loadedConfig.baselineEnd })
        }
        setLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => { cancelled = true }
  }, [])

  const draftValid = draft.baseline_start !== '' && draft.baseline_end !== '' && draft.baseline_start <= draft.baseline_end

  const persistBaseline = async () => {
    setStatus('saving')
    setError('')
    try {
      const response = await fetch('/api/admin/team-health-score-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const data = await response.json().catch(() => null) as { config?: { baseline_start: string; baseline_end: string }; error?: string } | null
      if (!response.ok) {
        setStatus('error')
        setError(data?.error ?? 'Failed to save baseline window.')
        return
      }
      if (data?.config) {
        setConfig({ baselineStart: data.config.baseline_start, baselineEnd: data.config.baseline_end })
      }
      setStatus('saved')
    } catch {
      setStatus('error')
      setError('Failed to save baseline window. Check your connection and try again.')
    }
  }

  if (!loaded) {
    return <div style={{ fontSize: 12, color: '#A5ACAF' }}>Loading baseline window…</div>
  }

  return (
    <div>
      {config && (
        <div style={{ color: '#A5ACAF', fontSize: 11, marginBottom: 10 }}>
          Current: <strong style={{ color: '#fff' }}>{formatWindowLabel(config.baselineStart, config.baselineEnd)}</strong>
        </div>
      )}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 11, color: '#A5ACAF', display: 'grid', gap: 4 }}>
          Start
          <input
            aria-label="baseline start date"
            className="form-control-dark"
            type="date"
            value={draft.baseline_start}
            onChange={(e) => { setDraft((d) => ({ ...d, baseline_start: e.target.value })); setStatus('dirty') }}
          />
        </label>
        <label style={{ fontSize: 11, color: '#A5ACAF', display: 'grid', gap: 4 }}>
          End
          <input
            aria-label="baseline end date"
            className="form-control-dark"
            type="date"
            value={draft.baseline_end}
            onChange={(e) => { setDraft((d) => ({ ...d, baseline_end: e.target.value })); setStatus('dirty') }}
          />
        </label>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        <button
          className="btn-primary"
          type="button"
          disabled={!draftValid || status === 'saving'}
          onClick={() => persistBaseline()}
          style={{ opacity: !draftValid || status === 'saving' ? 0.6 : 1 }}
        >
          {status === 'saving' ? 'Saving…' : 'Save baseline window'}
        </button>
        <div style={{ color: status === 'error' ? '#ff6b6b' : '#A5ACAF', fontSize: 11 }}>
          {status === 'saved' ? 'Saved' : status === 'dirty' ? 'Unsaved changes' : status === 'error' ? error : ''}
        </div>
      </div>
    </div>
  )
}
