'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Upload, X } from 'lucide-react'
import { WhoopImportClient, type ParticipantOption } from '@/app/admin/import/WhoopImportClient'

interface ParticipantCsvUploadButtonProps {
  participant: ParticipantOption
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function ParticipantCsvUploadButton({ participant }: ParticipantCsvUploadButtonProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const close = () => setOpen(false)

  // Move focus into the dialog when it opens, and restore it to the
  // trigger button when it closes.
  useEffect(() => {
    if (open) {
      closeButtonRef.current?.focus()
    } else {
      triggerRef.current?.focus()
    }
  }, [open])

  // Trap focus within the dialog and close on Escape while it's open.
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }

      if (e.key !== 'Tab' || !dialogRef.current) return

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute('disabled'),
      )
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="btn-primary flex items-center gap-1"
        onClick={() => setOpen(true)}
      >
        <Upload size={11} />
        Upload CSV
      </button>

      {open && (
        <div style={overlayStyle} onClick={close}>
          <div
            ref={dialogRef}
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
                ref={closeButtonRef}
                type="button"
                aria-label="Close"
                onClick={close}
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
