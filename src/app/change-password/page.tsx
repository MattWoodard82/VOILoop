'use client'

import { useState } from 'react'

export default function ChangePasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const response = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: 'Failed to finalize password change.' }))
      setError(body.error ?? 'Failed to finalize password change.')
      setLoading(false)
      return
    }
    const body = await response.json().catch(() => ({ redirectTo: '/executive' }))
    setSuccess('Password updated. Redirecting…')
    setSuccess('Password updated. Redirecting…')
    window.location.assign(body.redirectTo ?? '/executive')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d1f35', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 460, background: '#002244', border: '1px solid #0a3560', borderRadius: 12, padding: 32 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Change your password</h1>
        <p style={{ fontSize: 13, color: '#A5ACAF', marginBottom: 24, lineHeight: 1.6 }}>
          Your temporary password must be changed before you can use VOILoop.
        </p>

        <form method="post" action="/api/auth/change-password" onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, color: '#A5ACAF', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 6 }}>New password</label>
            <input
              type="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              style={{ width: '100%', background: '#001a33', border: '1px solid #0a3560', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: '#fff', fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, color: '#A5ACAF', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 6 }}>Confirm password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              style={{ width: '100%', background: '#001a33', border: '1px solid #0a3560', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: '#fff', fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {error && <div style={{ background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#ff6b6b', marginBottom: 14 }}>{error}</div>}
          {success && <div style={{ background: 'rgba(105,190,40,0.1)', border: '1px solid rgba(105,190,40,0.3)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#69BE28', marginBottom: 14 }}>{success}</div>}

          <button
            type="submit"
            disabled={loading || !password || !confirmPassword}
            style={{ width: '100%', background: loading || !password || !confirmPassword ? '#0a3560' : '#69BE28', color: loading || !password || !confirmPassword ? '#A5ACAF' : '#002244', border: 'none', borderRadius: 8, padding: '12px', fontSize: 14, fontWeight: 700, cursor: loading || !password || !confirmPassword ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}
          >
            {loading ? 'Updating...' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}
