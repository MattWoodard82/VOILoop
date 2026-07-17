'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { parseFrontendError } from '@/lib/frontend-error'
import { parseAdminDiagnosticResponse, type AdminDiagnosticResult } from '@/lib/login-diagnostic'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [errorDetail, setErrorDetail] = useState('')
  const [adminDiag, setAdminDiag] = useState<{ status: 'loading' } | AdminDiagnosticResult>({ status: 'loading' })

  useEffect(() => {
    fetch('/api/diagnostic/admin-user')
      .then(parseAdminDiagnosticResponse)
      .then((diag) => setAdminDiag(diag))
      .catch((err: unknown) => {
        setAdminDiag({ status: 'error', message: err instanceof Error ? err.message : String(err) })
      })
  }, [])

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setErrorDetail('')

    const formData = new FormData(e.currentTarget)
    const emailValue = String(formData.get('email') ?? '').trim()
    const passwordValue = String(formData.get('password') ?? '')

    if (!emailValue || !passwordValue) {
      setError('Enter your email and password.')
      setErrorDetail('Both fields are required before submitting.')
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailValue,
          password: passwordValue,
        }),
      })

      if (!response.ok) {
        const parsed = await parseFrontendError(response, 'Sign-in failed.')
        setError(parsed.message)
        setErrorDetail(parsed.detail)
        setLoading(false)
        return
      }

      const body = await response.json().catch(() => ({ redirectTo: '/wellness-director' })) as { redirectTo?: string }
      router.replace(body.redirectTo ?? '/wellness-director')
      router.refresh()
    } catch (requestError) {
      const detail = requestError instanceof Error ? requestError.message : String(requestError)
      setError('Sign-in request could not be completed.')
      setErrorDetail(`Detail: ${detail}`)
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d1f35', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <svg width="48" height="48" viewBox="0 0 36 36" fill="none" style={{ margin: '0 auto 12px' }}>
            <circle cx="18" cy="18" r="14" stroke="#0a3560" strokeWidth="2.5" />
            <path d="M18,4 A14,14 0 0,1 31,21" stroke="#69BE28" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M31,21 A14,14 0 0,1 18,32" stroke="#69BE28" strokeWidth="1.8" strokeLinecap="round" opacity="0.65" />
            <path d="M18,32 A14,14 0 0,1 5,21" stroke="#69BE28" strokeWidth="1.8" strokeLinecap="round" opacity="0.4" />
            <path d="M5,18 A14,14 0 0,1 16,4" stroke="#69BE28" strokeWidth="1.8" strokeLinecap="round" opacity="0.2" />
            <circle cx="18" cy="18" r="6" fill="#001a33" />
          </svg>
          <div><span style={{ fontWeight: 700, fontSize: 24, color: '#69BE28' }}>VOI</span><span style={{ fontWeight: 300, fontSize: 24, color: '#fff' }}>Loop</span></div>
          <div style={{ fontSize: 11, color: '#A5ACAF', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>Outcomes Platform</div>
        </div>
        {/* DIAGNOSTIC */}
        <div style={{ background: '#001a33', border: '1px solid #0a3560', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#A5ACAF', fontFamily: 'monospace' }}>
          <strong style={{ color: '#69BE28' }}>DIAG</strong>{' '}
          {adminDiag.status === 'loading' && 'loading…'}
          {adminDiag.status === 'found' && <span style={{ color: '#69BE28' }}>{adminDiag.id}</span>}
          {adminDiag.status === 'not_found' && <span style={{ color: '#ff6b6b' }}>admin user not found</span>}
          {adminDiag.status === 'error' && <span style={{ color: '#f59e0b' }}>request failed: {adminDiag.message}</span>}
        </div>
        <div style={{ background: '#002244', border: '1px solid #0a3560', borderRadius: 12, padding: 32 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 6 }}>Sign in to VOILoop</h1>
          <p style={{ fontSize: 13, color: '#A5ACAF', marginBottom: 24, lineHeight: 1.5 }}>Use your assigned email and password.</p>
          <form method="post" action="/api/auth/login" onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, color: '#A5ACAF', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 6 }}>Email address</label>
              <input
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                autoComplete="email"
                required
                placeholder="you@company.com"
                style={{ width: '100%', background: '#001a33', border: '1px solid #0a3560', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: '#fff', fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, color: '#A5ACAF', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 6 }}>Password</label>
              <input
                type="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                autoComplete="current-password"
                required
                placeholder="••••••••"
                style={{ width: '100%', background: '#001a33', border: '1px solid #0a3560', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: '#fff', fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {error && (
              <div style={{ background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#ff6b6b', marginBottom: 14 }}>
                <div>{error}</div>
                {errorDetail && (
                  <div style={{ marginTop: 6, color: '#fecaca', wordBreak: 'break-word' }}>
                    {errorDetail}
                  </div>
                )}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              style={{ width: '100%', background: loading ? '#0a3560' : '#69BE28', color: loading ? '#A5ACAF' : '#002244', border: 'none', borderRadius: 8, padding: '12px', fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
