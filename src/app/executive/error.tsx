'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function ExecutiveError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main style={{ minHeight: '100vh', background: '#002244', padding: '48px 20px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 840, margin: '0 auto', background: '#001a33', border: '1px solid #7f1d1d', borderRadius: 12, padding: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fca5a5', marginBottom: 10 }}>
          Executive dashboard error
        </div>
        <h1 style={{ margin: 0, color: '#fff', fontSize: 24 }}>The executive page could not load</h1>
        <p style={{ margin: '12px 0 0', color: '#f3f4f6', lineHeight: 1.6 }}>
          {error.message || 'A server-side error interrupted dashboard loading.'}
        </p>
        {error.digest && (
          <p style={{ margin: '10px 0 0', color: '#fca5a5', fontSize: 13 }}>
            Digest: {error.digest}
          </p>
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
          <button
            onClick={reset}
            style={{
              background: '#69BE28',
              color: '#002244',
              border: 'none',
              borderRadius: 8,
              padding: '10px 16px',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Retry dashboard
          </button>
          <Link
            href="/login"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #0a3560',
              borderRadius: 8,
              padding: '10px 16px',
              fontSize: 14,
              fontWeight: 700,
              color: '#fff',
              textDecoration: 'none',
            }}
          >
            Back to login
          </Link>
        </div>
      </div>
    </main>
  )
}
