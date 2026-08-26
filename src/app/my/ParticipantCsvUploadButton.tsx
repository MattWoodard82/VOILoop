'use client'

import { useState, type CSSProperties } from 'react'
import { Upload, X } from 'lucide-react'
import { WhoopImportClient, type ParticipantOption } from '@/app/admin/import/WhoopImportClient'

interface ParticipantCsvUploadButtonProps {
  participant: ParticipantOption
}

export function ParticipantCsvUploadButton({ participant }: ParticipantCsvUploadButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="btn-primary flex items-center gap-1"
        onClick={() => setOpen(true)}
      >
        <Upload size={11} />
        Upload CSV
      </button>

      {open && (
        <div style={overlayStyle} onClick={() => setOpen(false)}>
          <div
            style={modalStyle}
            role="dialog"
            aria-modal="true"
            aria-labelledby="participant-csv-upload-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 id="participant-csv-upload-title" style={{ margin: 0, color: '#fff', fontSize: 15 }}>
                Upload your WHOOP data
              </h3>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: '#A5ACAF', cursor: 'pointer', padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>
            <WhoopImportClient participants={[participant]} lockedParticipant={participant} />
          </div>
        </div>
      )}
    </>
  )
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.65)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 20,
}

const modalStyle: CSSProperties = {
  background: '#002244',
  border: '1px solid #0a3560',
  borderRadius: 12,
  padding: 24,
  maxWidth: 760,
  width: '100%',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
}
