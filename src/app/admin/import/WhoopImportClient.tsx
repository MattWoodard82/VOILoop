'use client'
import { useState, useRef, useCallback } from 'react'
import { Upload, CheckCircle, XCircle, AlertCircle, Download, RotateCcw } from 'lucide-react'
import type { ImportResult, ImportRowError } from '@/lib/whoop/types'

type UploadStatus = 'idle' | 'uploading' | 'success' | 'partial' | 'error'
const MAX_DISPLAYED_ERRORS = 100

export function WhoopImportClient() {
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [structureErrors, setStructureErrors] = useState<string[] | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setStatus('error')
      setStructureErrors(['Only .csv files are supported'])
      return
    }

    setStatus('uploading')
    setResult(null)
    setStructureErrors(null)

    const body = new FormData()
    body.append('file', file)

    try {
      const res = await fetch('/api/import/whoop', { method: 'POST', body })
      const json = await res.json()

      if (!res.ok) {
        setStatus('error')
        setStructureErrors(json.details ?? [json.error ?? 'Upload failed'])
        return
      }

      const importResult: ImportResult = json
      setResult(importResult)

      if (importResult.totals.failed > 0 && importResult.totals.inserted + importResult.totals.updated > 0) {
        setStatus('partial')
      } else if (importResult.totals.failed > 0) {
        setStatus('error')
      } else {
        setStatus('success')
      }
    } catch (e) {
      setStatus('error')
      setStructureErrors([(e as Error).message])
    }
  }, [])

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (status === 'uploading') return
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const openFilePicker = () => {
    if (status !== 'uploading') fileInputRef.current?.click()
  }

  const onDropZoneKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (status === 'uploading') return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      fileInputRef.current?.click()
    }
  }
  const downloadErrors = () => {
    if (!result?.errors.length) return
    const csv = [
      'tab,row,field,message',
      ...result.errors.map((e: ImportRowError) =>
        [e.tab, e.row, e.field ?? '', e.message].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `import-errors-${result.fileName.replace(/\.csv$/i, '')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const reset = () => {
    setStatus('idle')
    setResult(null)
    setStructureErrors(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Instructions */}
      <div style={{ marginBottom: 20, padding: '14px 18px', borderRadius: 8, background: '#001a33', border: '1px solid #0a3560' }}>
        <div style={{ fontSize: 13, color: '#A5ACAF', lineHeight: 1.6 }}>
          <strong style={{ color: '#fff' }}>Accepted format:</strong> WHOOP export CSV (<code>.csv</code>) with WHOOP column headers.
          <br />
          <strong style={{ color: '#fff' }}>Note:</strong> Re-uploading the same CSV is safe — records are upserted, not duplicated.
        </div>
      </div>

      {/* Drop zone */}
      {status === 'idle' || status === 'uploading' ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={openFilePicker}
          onKeyDown={onDropZoneKeyDown}
          role="button"
          tabIndex={status === 'uploading' ? -1 : 0}
          aria-disabled={status === 'uploading'}
          style={{
            border: `2px dashed ${dragOver ? '#69BE28' : '#0a3560'}`,
            borderRadius: 10,
            padding: '48px 24px',
            textAlign: 'center',
            cursor: status === 'uploading' ? 'not-allowed' : 'pointer',
            background: dragOver ? 'rgba(105,190,40,0.05)' : '#001a33',
            transition: 'all 0.15s',
          }}
        >
          {status === 'uploading' ? (
            <div>
              <div style={{ width: 40, height: 40, margin: '0 auto 12px', borderRadius: '50%', border: '3px solid #0a3560', borderTop: '3px solid #69BE28', animation: 'spin 1s linear infinite' }} />
              <div style={{ color: '#A5ACAF', fontSize: 14 }}>Uploading and processing…</div>
            </div>
          ) : (
            <>
              <Upload size={36} color="#0a3560" style={{ margin: '0 auto 12px', display: 'block' }} />
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                Drop your WHOOP export here
              </div>
              <div style={{ color: '#A5ACAF', fontSize: 13 }}>or click to browse — .csv files only</div>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={onInputChange}
            disabled={status === 'uploading'}
          />
        </div>
      ) : null}

      {/* Structure errors (fast-fail validation) */}
      {structureErrors && (
        <div style={{ marginTop: 20, padding: '14px 18px', borderRadius: 8, background: '#1a0a0a', border: '1px solid #7f1d1d' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <XCircle size={18} color="#ef4444" />
            <span style={{ color: '#ef4444', fontWeight: 600 }}>Import failed</span>
          </div>
          {structureErrors.map((e, i) => (
            <div key={i} style={{ color: '#fca5a5', fontSize: 13, marginLeft: 26 }}>• {e}</div>
          ))}
          <button onClick={reset} style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, color: '#69BE28', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>
            <RotateCcw size={14} /> Try again
          </button>
        </div>
      )}

      {/* Import result */}
      {result && (
        <div style={{ marginTop: 20 }}>
          {/* Status banner */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px',
            borderRadius: 8, marginBottom: 16,
            background: status === 'success' ? 'rgba(105,190,40,0.1)' : status === 'partial' ? 'rgba(234,179,8,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${status === 'success' ? '#69BE28' : status === 'partial' ? '#eab308' : '#ef4444'}`,
          }}>
            {status === 'success' && <CheckCircle size={20} color="#69BE28" />}
            {status === 'partial' && <AlertCircle size={20} color="#eab308" />}
            {status === 'error' && <XCircle size={20} color="#ef4444" />}
            <div>
              <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>
                {status === 'success' && 'Import successful'}
                {status === 'partial' && 'Partially imported — some rows failed'}
                {status === 'error' && 'Import failed'}
              </div>
              <div style={{ color: '#A5ACAF', fontSize: 12 }}>{result.fileName}</div>
            </div>
          </div>

          {/* Totals */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Processed', value: result.totals.processed, color: '#A5ACAF' },
              { label: 'Inserted', value: result.totals.inserted, color: '#69BE28' },
              { label: 'Updated', value: result.totals.updated, color: '#3b82f6' },
              { label: 'Skipped', value: result.totals.skipped, color: '#eab308' },
              { label: 'Failed', value: result.totals.failed, color: '#ef4444' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ textAlign: 'center', padding: '10px 0', background: '#001a33', borderRadius: 8, border: '1px solid #0a3560' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
                <div style={{ fontSize: 11, color: '#A5ACAF', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Per-tab breakdown */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: '#A5ACAF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Per-tab breakdown</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: '#A5ACAF' }}>
                  {['Tab', 'Processed', 'Inserted', 'Updated', 'Failed'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Tab' ? 'left' : 'right', padding: '6px 10px', borderBottom: '1px solid #0a3560' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.tabs.map((t) => (
                  <tr key={t.tab} style={{ color: '#fff' }}>
                    <td style={{ padding: '7px 10px', borderBottom: '1px solid #0a3560' }}>{t.tab}</td>
                    <td style={{ textAlign: 'right', padding: '7px 10px', borderBottom: '1px solid #0a3560' }}>{t.processed}</td>
                    <td style={{ textAlign: 'right', padding: '7px 10px', borderBottom: '1px solid #0a3560', color: '#69BE28' }}>{t.inserted}</td>
                    <td style={{ textAlign: 'right', padding: '7px 10px', borderBottom: '1px solid #0a3560', color: '#3b82f6' }}>{t.updated}</td>
                    <td style={{ textAlign: 'right', padding: '7px 10px', borderBottom: '1px solid #0a3560', color: t.failed > 0 ? '#ef4444' : '#A5ACAF' }}>{t.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Row errors */}
          {result.errors.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: '#A5ACAF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Row errors ({result.errors.length})
                </div>
                <button
                  onClick={downloadErrors}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#69BE28', fontSize: 12, background: 'none', border: '1px solid #69BE28', borderRadius: 5, padding: '4px 10px', cursor: 'pointer' }}
                >
                  <Download size={12} /> Download CSV
                </button>
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #0a3560', borderRadius: 6 }}>
                {result.errors.slice(0, MAX_DISPLAYED_ERRORS).map((e: ImportRowError, i: number) => (
                  <div key={i} style={{ padding: '7px 12px', borderBottom: '1px solid #0a3560', fontSize: 12 }}>
                    <span style={{ color: '#A5ACAF' }}>[{e.tab} row {e.row}]</span>{' '}
                    {e.field && <span style={{ color: '#eab308' }}>{e.field}: </span>}
                    <span style={{ color: '#fca5a5' }}>{e.message}</span>
                  </div>
                ))}
                {result.errors.length > MAX_DISPLAYED_ERRORS && (
                  <div style={{ padding: '7px 12px', color: '#A5ACAF', fontSize: 12 }}>… and {result.errors.length - MAX_DISPLAYED_ERRORS} more (download CSV for full list)</div>
                )}
              </div>
            </div>
          )}

          <button onClick={reset} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#69BE28', fontSize: 13, background: 'none', border: '1px solid #0a3560', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}>
            <RotateCcw size={14} /> Import another file
          </button>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
