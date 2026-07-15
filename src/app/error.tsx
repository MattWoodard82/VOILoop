'use client'

import { useEffect } from 'react'
import { isPublicErrorDiagnosticsEnabled } from '@/lib/feature-flags'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  const showDiagnostics = isPublicErrorDiagnosticsEnabled()
  const cause = showDiagnostics
    ? error.cause instanceof Error
      ? error.cause.message
      : typeof error.cause === 'string'
        ? error.cause
        : null
    : null
  const stackPreview = showDiagnostics && error.stack ? error.stack.split('\n').slice(0, 4).join('\n') : null

  return (
    <main style={{ minHeight: '100vh', background: '#002244', padding: '48px 20px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', background: '#001a33', border: '1px solid #7f1d1d', borderRadius: 12, padding: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fca5a5', marginBottom: 10 }}>
          Application error
        </div>
        <h1 style={{ margin: 0, color: '#fff', fontSize: 24 }}>Something went wrong</h1>
        <p style={{ margin: '12px 0 0', color: '#f3f4f6', lineHeight: 1.6 }}>
          {error.message || 'An unexpected server error occurred.'}
        </p>
        {showDiagnostics && (
          <div style={{ margin: '10px 0 0', color: '#fecaca', fontSize: 12, lineHeight: 1.5 }}>
            {`Name: ${error.name || 'Error'}`}
            {cause && <div>{`Cause: ${cause}`}</div>}
            {stackPreview && (
              <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', color: '#fca5a5', fontSize: 11 }}>
                {stackPreview}
              </pre>
            )}
          </div>
        )}
        {error.digest && (
          <p style={{ margin: '10px 0 0', color: '#fca5a5', fontSize: 13 }}>
            Digest: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          style={{
            marginTop: 18,
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
          Try again
        </button>
      </div>
    </main>
  )
}
