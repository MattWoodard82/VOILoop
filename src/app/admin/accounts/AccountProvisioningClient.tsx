'use client'

import { useRef, useState } from 'react'
import { Upload, Download } from 'lucide-react'

export function AccountProvisioningClient() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      setError('Select a CSV file first.')
      return
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Only .csv files are supported.')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/admin/accounts/bulk-create', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: 'Account creation failed.' }))
        setError(body.error ?? 'Account creation failed.')
        setLoading(false)
        return
      }

      const outputCsv = await response.text()
      const blob = new Blob([outputCsv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'pilot-user-passwords.csv'
      anchor.click()
      URL.revokeObjectURL(url)

      setSuccess('Accounts processed. Downloaded password CSV.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Account creation failed.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 20, padding: '14px 18px', borderRadius: 8, background: '#001a33', border: '1px solid #0a3560' }}>
        <div style={{ fontSize: 13, color: '#A5ACAF', lineHeight: 1.6 }}>
          Upload a CSV of user emails. The output CSV includes generated 8-character alphanumeric passwords.
          <br />
          Users are set to <strong style={{ color: '#fff' }}>employee</strong> role and required to change password at first login.
        </div>
      </div>

      <div style={{ background: '#002244', border: '1px solid #0a3560', borderRadius: 12, padding: 20 }}>
        <div style={{ marginBottom: 12, fontSize: 12, color: '#A5ACAF', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          Input CSV
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? '')}
          style={{ width: '100%', marginBottom: 16, color: '#A5ACAF' }}
        />
        {fileName && <div style={{ fontSize: 12, color: '#A5ACAF', marginBottom: 12 }}>Selected: {fileName}</div>}

        {error && <div style={{ background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#ff6b6b', marginBottom: 12 }}>{error}</div>}
        {success && <div style={{ background: 'rgba(105,190,40,0.1)', border: '1px solid rgba(105,190,40,0.3)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#69BE28', marginBottom: 12 }}>{success}</div>}

        <button
          type="button"
          onClick={handleUpload}
          disabled={loading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: loading ? '#0a3560' : '#69BE28', color: loading ? '#A5ACAF' : '#002244', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? <Upload size={14} /> : <Download size={14} />}
          {loading ? 'Processing...' : 'Generate Password CSV'}
        </button>
      </div>
    </div>
  )
}
