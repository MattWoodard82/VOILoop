'use client'

import { useRef, useState } from 'react'
import { Upload, Download } from 'lucide-react'
import { parseFrontendError } from '@/lib/frontend-error'

type AccountType = 'employee' | 'wellness_director'

const ACCOUNT_TYPE_COPY: Record<AccountType, {
  title: string
  successLabel: string
  description: string
  downloadName: string
  buttonLabel: string
}> = {
  employee: {
    title: 'Employee accounts',
    successLabel: 'employee',
    description: 'Upload a CSV of user emails. Each account is created as an employee, receives a generated password, and is required to change that password at first login.',
    downloadName: 'employee-passwords.csv',
    buttonLabel: 'Generate Employee Password CSV',
  },
  wellness_director: {
    title: 'Wellness Director accounts',
    successLabel: 'Wellness Director',
    description: 'Upload a CSV of user emails. Each account is created as a Wellness Director, receives a generated password, and is required to change that password at first login.',
    downloadName: 'wellness-director-passwords.csv',
    buttonLabel: 'Generate Wellness Director Password CSV',
  },
}

function getDownloadName(contentDisposition: string | null, fallback: string): string {
  const match = contentDisposition?.match(/filename="([^"]+)"/i)
  return match?.[1] ?? fallback
}

export function AccountProvisioningClient() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [accountType, setAccountType] = useState<AccountType>('employee')
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [errorDetail, setErrorDetail] = useState('')
  const [success, setSuccess] = useState('')
  const accountCopy = ACCOUNT_TYPE_COPY[accountType]

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      setError('Select a CSV file first.')
      setErrorDetail('')
      return
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Only .csv files are supported.')
      setErrorDetail('')
      return
    }

    setLoading(true)
    setError('')
    setErrorDetail('')
    setSuccess('')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('accountType', accountType)

    try {
      const response = await fetch('/api/admin/accounts/bulk-create', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const parsed = await parseFrontendError(response, 'Account creation failed.')
        setError(parsed.message)
        setErrorDetail(parsed.detail)
        setLoading(false)
        return
      }

      const outputCsv = await response.text()
      const blob = new Blob([outputCsv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = getDownloadName(response.headers.get('Content-Disposition'), accountCopy.downloadName)
      anchor.click()
      URL.revokeObjectURL(url)

      setSuccess(`Accounts processed. Downloaded ${accountCopy.successLabel} password CSV.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Account creation failed.'
      setError(message)
      setErrorDetail('The request did not complete. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 20, padding: '14px 18px', borderRadius: 8, background: '#001a33', border: '1px solid #0a3560' }}>
        <div style={{ fontSize: 13, color: '#A5ACAF', lineHeight: 1.6 }}>
          {accountCopy.description}
        </div>
      </div>

      <div style={{ background: '#002244', border: '1px solid #0a3560', borderRadius: 12, padding: 20 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 12, fontSize: 12, color: '#A5ACAF', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            Account type
          </div>
          <div role="radiogroup" aria-label="Account type" style={{ display: 'flex', gap: 10 }}>
            {(['employee', 'wellness_director'] as const).map((option) => {
              const selected = accountType === option
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setAccountType(option)}
                  disabled={loading}
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    background: selected ? 'rgba(105,190,40,0.12)' : '#001a33',
                    border: selected ? '1px solid #69BE28' : '1px solid #0a3560',
                    borderRadius: 10,
                    padding: '12px 14px',
                    color: '#fff',
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                    {ACCOUNT_TYPE_COPY[option].title}
                  </div>
                  <div style={{ fontSize: 12, color: '#A5ACAF', lineHeight: 1.5 }}>
                    {option === 'employee'
                      ? 'Creates employee accounts and employee records.'
                      : 'Creates dashboard-viewer accounts without employee records.'}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

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

        {error && (
          <div style={{ background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#ff6b6b', marginBottom: 12 }}>
            <div>{error}</div>
            {errorDetail && (
              <div style={{ marginTop: 6, color: '#fecaca', wordBreak: 'break-word' }}>
                {errorDetail}
              </div>
            )}
          </div>
        )}
        {success && <div style={{ background: 'rgba(105,190,40,0.1)', border: '1px solid rgba(105,190,40,0.3)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#69BE28', marginBottom: 12 }}>{success}</div>}

        <button
          type="button"
          onClick={handleUpload}
          disabled={loading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: loading ? '#0a3560' : '#69BE28', color: loading ? '#A5ACAF' : '#002244', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? <Upload size={14} /> : <Download size={14} />}
          {loading ? 'Processing...' : accountCopy.buttonLabel}
        </button>
      </div>
    </div>
  )
}
