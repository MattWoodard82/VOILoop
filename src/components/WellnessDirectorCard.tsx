'use client'
import type { Nudge } from '@/components/participant-events-types'

export function WellnessDirectorCard({ name, nudge }: { name: string; nudge: Nudge | null }) {
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
