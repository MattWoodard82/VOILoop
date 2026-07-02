'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    window.location.href = '/executive'
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
        <div style={{ background: '#002244', border: '1px solid #0a3560', borderRadius: 12, padding: 32 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 6 }}>Sign in to VOILoop</h1>
          <p style={{ fontSize: 13, color: '#A5ACAF', marginBottom: 24, lineHeight: 1.5 }}>Use your assigned email and password.</p>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, color: '#A5ACAF', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 6 }}>Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
                style={{ width: '100%', background: '#001a33', border: '1px solid #0a3560', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: '#fff', fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, color: '#A5ACAF', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 6 }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{ width: '100%', background: '#001a33', border: '1px solid #0a3560', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: '#fff', fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {error && <div style={{ background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#ff6b6b', marginBottom: 14 }}>{error}</div>}
            <button
              type="submit"
              disabled={loading || !email || !password}
              style={{ width: '100%', background: loading || !email || !password ? '#0a3560' : '#69BE28', color: loading || !email || !password ? '#A5ACAF' : '#002244', border: 'none', borderRadius: 8, padding: '12px', fontSize: 14, fontWeight: 700, cursor: loading || !email || !password ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
