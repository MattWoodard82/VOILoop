'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DEMO_REFRESH_CONFIRMATION } from '@/lib/demo-story'

export function DemoDataRefreshClient() {
  const router = useRouter()
  const busy = useRef(false)
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function refresh() {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/admin/demo-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: DEMO_REFRESH_CONFIRMATION }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Demo refresh failed. Try again after checking the configuration.')
      if (typeof data.anchor !== 'string' || !Number.isInteger(data.pulse_count) || !Number.isInteger(data.recovery_count)) {
        throw new Error('Unexpected refresh response. Check the database before retrying.')
      }
      setMessage(`Refreshed to ${data.anchor}: ${data.pulse_count} pulse responses and ${data.recovery_count} recovery records. Accounts and other data were preserved.`)
      setConfirming(false)
      router.refresh()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to refresh. Check your connection and try again.')
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  return (
    <section className="card" aria-labelledby="demo-refresh-heading" aria-busy={pending}>
      <h2 id="demo-refresh-heading" style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Demo data refresh</h2>
      <p style={{ fontSize: 12, color: '#A5ACAF', marginBottom: 14 }}>
        Bring pulse responses and the recovery story up to today before a walkthrough.
        Accounts, settings, interventions, and other wellness measurements stay unchanged.
      </p>
      {confirming && <p style={{ fontSize: 12, color: '#fff', marginBottom: 10 }}>
        Replace synthetic pulse history and recovery scores with a refreshed demo story?
      </p>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn-primary" disabled={pending} style={{ opacity: pending ? 0.6 : 1 }}
          onClick={() => confirming ? void refresh() : setConfirming(true)}>
          {pending ? 'Refreshing demo data...' : confirming ? 'Confirm refresh' : 'Refresh demo data'}
        </button>
        {confirming && <button type="button" className="btn-primary" disabled={pending}
          style={{ background: 'transparent', color: '#A5ACAF', border: '1px solid #1e4d78', opacity: pending ? 0.6 : 1 }}
          onClick={() => { setConfirming(false); setError('') }}>Cancel</button>}
      </div>
      {message && <p role="status" style={{ fontSize: 12, color: '#69BE28', marginTop: 12 }}>{message}</p>}
      {error && <p role="alert" style={{ fontSize: 12, color: '#ff6b6b', marginTop: 12 }}>{error}</p>}
    </section>
  )
}
