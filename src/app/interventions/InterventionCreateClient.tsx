'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { parseFrontendError } from '@/lib/frontend-error'
import { Alert } from '@/components/ui'

interface ParticipantOption {
  id: string
  first_name: string
  last_name: string
  department: string
}

interface Props {
  participants: ParticipantOption[]
}

const modalOverlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 8, 16, 0.7)',
  display: 'grid',
  placeItems: 'center',
  zIndex: 50,
  padding: 16,
}

const modalPanel: CSSProperties = {
  width: 'min(680px, 100%)',
  background: '#002244',
  border: '1px solid #0a3560',
  borderRadius: 12,
  padding: 18,
}

const fieldLabel: CSSProperties = {
  display: 'grid',
  gap: 4,
  fontSize: 11,
  color: '#A5ACAF',
}

const fieldInput: CSSProperties = {
  background: '#001a33',
  border: '1px solid #0a3560',
  borderRadius: 8,
  color: '#fff',
  fontSize: 12,
  padding: '8px 10px',
  fontFamily: 'Inter, sans-serif',
}

export function InterventionCreateClient({ participants }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [participantId, setParticipantId] = useState(participants[0]?.id ?? '')
  const [dateTriggered, setDateTriggered] = useState(new Date().toISOString().slice(0, 10))
  const [triggerMetric, setTriggerMetric] = useState('')
  const [triggerValue, setTriggerValue] = useState('')
  const [interventionType, setInterventionType] = useState('')
  const [assignedTo, setAssignedTo] = useState('Wellness Director')
  const [notes, setNotes] = useState('')

  const selectedParticipant = useMemo(
    () => participants.find((participant) => participant.id === participantId) ?? null,
    [participants, participantId],
  )

  const close = () => {
    if (saving) return
    setOpen(false)
    setError(null)
  }

  const handleSubmit = async () => {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/interventions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          participant_id: participantId,
          date_triggered: dateTriggered,
          trigger_metric: triggerMetric,
          trigger_value: triggerValue,
          intervention_type: interventionType,
          assigned_to: assignedTo,
          notes,
        }),
      })

      if (!response.ok) {
        const parsed = await parseFrontendError(response, 'Failed to create intervention')
        const detail = parsed.detail ? ` (${parsed.detail})` : ''
        setError(`${parsed.message}${detail}`)
        return
      }

      const created = await response.json()
      setOpen(false)
      router.refresh()
      if (created?.id) {
        router.push(`/interventions/${created.id}`)
      }
    } catch {
      setError('Failed to create intervention (network error)')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        className="btn-primary"
        style={{ fontSize: 10, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 4 }}
        type="button"
        onClick={() => setOpen(true)}
      >
        <Plus size={10} /> Log new
      </button>
      {open && (
        <div style={modalOverlay}>
          <div
            style={modalPanel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="intervention-create-title"
          >
            <div id="intervention-create-title" style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 12 }}>
              Log New Intervention
            </div>
            {error && <Alert variant="warn">{error}</Alert>}

            {participants.length === 0 ? (
              <div style={{ color: '#A5ACAF', fontSize: 12, marginBottom: 12 }}>No active participants available.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <label style={fieldLabel}>
                  Participant
                  <select value={participantId} onChange={(event) => setParticipantId(event.target.value)} style={fieldInput}>
                    {participants.map((participant) => (
                      <option key={participant.id} value={participant.id}>
                        {participant.first_name} {participant.last_name} ({participant.id})
                      </option>
                    ))}
                  </select>
                </label>
                <label style={fieldLabel}>
                  Department
                  <input value={selectedParticipant?.department ?? 'Unknown'} style={fieldInput} disabled />
                </label>
                <label style={fieldLabel}>
                  Trigger metric
                  <input value={triggerMetric} onChange={(event) => setTriggerMetric(event.target.value)} style={fieldInput} placeholder="Recovery Score" />
                </label>
                <label style={fieldLabel}>
                  Trigger value
                  <input value={triggerValue} onChange={(event) => setTriggerValue(event.target.value)} style={fieldInput} placeholder="38" />
                </label>
                <label style={fieldLabel}>
                  Intervention type
                  <input value={interventionType} onChange={(event) => setInterventionType(event.target.value)} style={fieldInput} placeholder="1:1 Wellness Check-in" />
                </label>
                <label style={fieldLabel}>
                  Assigned to
                  <input value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} style={fieldInput} />
                </label>
                <label style={fieldLabel}>
                  Date triggered
                  <input type="date" value={dateTriggered} onChange={(event) => setDateTriggered(event.target.value)} style={fieldInput} />
                </label>
                <label style={fieldLabel}>
                  Initial status
                  <input value="Pending" style={fieldInput} disabled />
                </label>
                <label style={{ ...fieldLabel, gridColumn: '1 / -1' }}>
                  Notes (optional)
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={3}
                    style={{ ...fieldInput, resize: 'vertical' }}
                    placeholder="Why this intervention is being logged..."
                  />
                </label>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={close}
                style={{ background: 'transparent', border: '1px solid #0a3560', color: '#A5ACAF', borderRadius: 8, padding: '8px 12px', fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer' }}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                style={{ background: '#69BE28', border: 'none', color: '#002244', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: saving || participants.length === 0 ? 'not-allowed' : 'pointer' }}
                disabled={saving || participants.length === 0}
              >
                {saving ? 'Creating...' : 'Create intervention'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
