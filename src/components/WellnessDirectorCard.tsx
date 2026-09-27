'use client'
import { useEffect, useState } from 'react'

interface Nudge {
  id: string
  message: string
  author: string
  week_of: string
}

export function WellnessDirectorCard({ name }: { name: string }) {
  const [nudge, setNudge] = useState<Nudge | null>(null)

  useEffect(() => {
    let mounted = true
    const loadNudge = async () => {
      try {
        // Same-day visibility: fetch fresh (no cache) so a nudge appears here
        // immediately after the wellness director publishes it, alongside the
        // Nudges & Events card below.
        const response = await fetch('/api/participant/events', { cache: 'no-store' })
        if (!response.ok) return
        const payload = await response.json() as { nudge?: Nudge | null }
        if (mounted) setNudge(payload.nudge ?? null)
      } catch {
        // Silently ignore; this card degrades to name-only display.
      }
    }
    void loadNudge()
    return () => { mounted = false }
  }, [])

  return (
    <div
      style={{
        background: '#002244',
        border: '1px solid #0a3560',
        borderRadius: 10,
        padding: '14px 18px',
        marginBottom: 14,
      }}
    >
      <div style={{ fontSize: 10, color: '#A5ACAF', textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 600, marginBottom: 6 }}>
        Wellness director
      </div>
      <div style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>
        {name}
      </div>
      {nudge && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #0a3560' }}>
          <div style={{ fontSize: 10, color: '#69BE28', textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 600, marginBottom: 4 }}>
            This week&apos;s focus
          </div>
          <div style={{ fontSize: 12, color: '#A5ACAF', lineHeight: 1.5 }}>
            {nudge.message}
          </div>
        </div>
      )}
    </div>
  )
}
