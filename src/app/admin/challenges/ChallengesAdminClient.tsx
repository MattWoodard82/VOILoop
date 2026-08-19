'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Alert, Badge, Card, SkeletonBlock, TableSkeleton } from '@/components/ui'
import { parseFrontendError } from '@/lib/frontend-error'

// Maps API error codes to human-readable messages
function formatApiError(code: string | undefined, fallback: string): string {
  const messages: Record<string, string> = {
    CHALLENGE_ACTIVE_EXISTS: 'Another challenge is already active. Cancel or complete it before activating this one.',
    INVALID_WINDOW: 'The time window is invalid. Make sure the end date is after the start date.',
    INVALID_THRESHOLD: 'Threshold must be a positive whole number.',
    INVALID_ELIGIBILITY: 'Eligibility definition is invalid or missing required fields.',
    INVALID_NAME: 'Name must be between 3 and 120 characters.',
    INVALID_DESCRIPTION: 'Description must be 1000 characters or fewer.',
    INVALID_METRIC_TYPE: 'Unsupported metric type.',
    VERSION_CONFLICT: 'This challenge was changed by someone else. Refresh and try again.',
  }
  return messages[code ?? ''] ?? fallback
}

type Challenge = {
  id: string
  name: string
  description: string | null
  status: 'draft' | 'active' | 'completed' | 'cancelled'
  metric_type: string
  threshold_value: number
  window_start_at: string
  window_end_at: string
  eligibility_mode: string
  version: number
}

type ChallengeDetail = {
  challenge: Challenge
  summary: {
    total_participants: number
    eligible_count: number
    completed_count: number
  }
}

type Participant = {
  participant_id: string
  is_eligible: boolean
  progress_value: number
  completed: boolean
  completed_at: string | null
}

export function ChallengesAdminClient() {
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createName, setCreateName] = useState('Pilot Actions Challenge')
  const [createThreshold, setCreateThreshold] = useState(5)
  const [createStart, setCreateStart] = useState(new Date().toISOString().slice(0, 10))
  const [createEnd, setCreateEnd] = useState(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ChallengeDetail | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [participantStatus, setParticipantStatus] = useState<'all' | 'completed' | 'incomplete'>('all')
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [detailLoading, setDetailLoading] = useState(false)
  const [participantsLoading, setParticipantsLoading] = useState(false)

  // Confirmation modal state
  const [activateModal, setActivateModal] = useState<Challenge | null>(null)
  const [cancelModal, setCancelModal] = useState<Challenge | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  const activeChallenge = useMemo(() => challenges.find((challenge) => challenge.status === 'active') ?? null, [challenges])

  const setErrorFromResponse = async (response: Response, fallbackMessage: string) => {
    const parsed = await parseFrontendError(response, fallbackMessage)
    // parsed.message contains the `error` field from the API JSON body (e.g. "CHALLENGE_ACTIVE_EXISTS")
    setError(formatApiError(parsed.message, `${parsed.message}${parsed.detail ? ` (${parsed.detail})` : ''}`))
  }

  const loadChallenges = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/challenges', { cache: 'no-store' })
      if (!response.ok) {
        await setErrorFromResponse(response, 'Failed to load challenges')
        return
      }
      const payload = await response.json()
      setChallenges(payload.challenges ?? [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load challenges')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadChallenges()
  }, [])

  useEffect(() => {
    if (!selectedChallengeId) return
    void loadDetail(selectedChallengeId)
    void loadParticipants(selectedChallengeId, participantStatus)
  }, [selectedChallengeId, participantStatus])

  const createDraft = async () => {
    setError(null)
    const response = await fetch('/api/admin/challenges', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: createName,
        description: 'Pilot challenge for smoke testing',
        metric_type: 'actions_count',
        threshold_value: createThreshold,
        window_start_at: `${createStart}T00:00:00.000Z`,
        window_end_at: `${createEnd}T23:59:59.000Z`,
        eligibility_mode: 'all_participants',
      }),
    })
    if (!response.ok) {
      await setErrorFromResponse(response, 'Failed to create challenge')
      return
    }
    await loadChallenges()
  }

  const loadDetail = async (challengeId: string) => {
    setDetailLoading(true)
    const response = await fetch(`/api/admin/challenges/${challengeId}`, { cache: 'no-store' })
    if (!response.ok) {
      await setErrorFromResponse(response, 'Failed to load challenge details')
      setDetailLoading(false)
      return
    }
    const payload = await response.json()
    setDetail(payload as ChallengeDetail)
    setEditName(payload.challenge.name ?? '')
    setEditDescription(payload.challenge.description ?? '')
    setDetailLoading(false)
  }

  const loadParticipants = async (challengeId: string, status: 'all' | 'completed' | 'incomplete') => {
    setParticipantsLoading(true)
    const query = status === 'all' ? '' : `?status=${status}`
    const response = await fetch(`/api/admin/challenges/${challengeId}/participants${query}`, { cache: 'no-store' })
    if (!response.ok) {
      await setErrorFromResponse(response, 'Failed to load participants')
      setParticipantsLoading(false)
      return
    }
    const payload = await response.json()
    setParticipants(payload.participants ?? [])
    setParticipantsLoading(false)
  }

  const updateChallenge = async () => {
    if (!detail) return
    setError(null)
    const response = await fetch(`/api/admin/challenges/${detail.challenge.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        version: detail.challenge.version,
        name: editName,
        description: editDescription,
      }),
    })
    if (!response.ok) {
      await setErrorFromResponse(response, 'Failed to update challenge')
      return
    }
    await loadChallenges()
    await loadDetail(detail.challenge.id)
  }

  const activateChallenge = async (challenge: Challenge) => {
    setError(null)
    const response = await fetch(`/api/admin/challenges/${challenge.id}/activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: challenge.version }),
    })
    if (!response.ok) {
      await setErrorFromResponse(response, 'Failed to activate challenge')
      return
    }
    setActivateModal(null)
    await loadChallenges()
  }

  const cancelChallenge = async (challenge: Challenge, reason: string) => {
    setError(null)
    const response = await fetch(`/api/admin/challenges/${challenge.id}/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: challenge.version, reason: reason.trim() || null }),
    })
    if (!response.ok) {
      await setErrorFromResponse(response, 'Failed to cancel challenge')
      return
    }
    setCancelModal(null)
    setCancelReason('')
    await loadChallenges()
  }

  const completeChallenge = async (challenge: Challenge) => {
    setError(null)
    const response = await fetch(`/api/admin/challenges/${challenge.id}/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: challenge.version }),
    })
    if (!response.ok) {
      await setErrorFromResponse(response, 'Failed to complete challenge')
      return
    }
    await loadChallenges()
  }

  const runRecompute = async () => {
    setError(null)
    const response = await fetch('/api/admin/challenges/recompute', { method: 'POST' })
    if (!response.ok) {
      await setErrorFromResponse(response, 'Failed to run recompute')
      return
    }
    await loadChallenges()
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {error && <Alert variant="warn">{error}</Alert>}

      {/* Activate confirmation modal */}
      {activateModal && (
        <div style={overlayStyle}>
          <div style={modalStyle} role="dialog" aria-modal="true" aria-labelledby="activate-modal-title">
            <h3 id="activate-modal-title" style={{ margin: '0 0 8px', color: '#fff', fontSize: 15 }}>Activate challenge?</h3>
            <p style={{ margin: '0 0 12px', color: '#A5ACAF', fontSize: 13 }}>
              <strong style={{ color: '#fff' }}>{activateModal.name}</strong> will become the active challenge.
              Once activated, the following fields are <strong style={{ color: '#ffd966' }}>locked and cannot be changed</strong>:
            </p>
            <ul style={{ margin: '0 0 16px', paddingLeft: 20, fontSize: 13, color: '#A5ACAF', lineHeight: 1.8 }}>
              <li>Metric type: <strong style={{ color: '#fff' }}>{activateModal.metric_type}</strong></li>
              <li>Threshold: <strong style={{ color: '#fff' }}>{activateModal.threshold_value}</strong></li>
              <li>Window: <strong style={{ color: '#fff' }}>{new Date(activateModal.window_start_at).toLocaleDateString()} – {new Date(activateModal.window_end_at).toLocaleDateString()}</strong></li>
              <li>Eligibility mode: <strong style={{ color: '#fff' }}>{activateModal.eligibility_mode}</strong></li>
              <li>Eligibility definition: <strong style={{ color: '#fff' }}>{activateModal.eligibility_mode === 'filtered' ? 'filtered criteria (locked)' : 'all participants'}</strong></li>
            </ul>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setActivateModal(null)} style={{ ...buttonStyle, background: '#1a2a3a' }}>Cancel</button>
              <button type="button" onClick={() => activateChallenge(activateModal)} style={{ ...buttonStyle, background: '#1f5f2f' }}>Confirm activate</button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel confirmation modal */}
      {cancelModal && (
        <div style={overlayStyle}>
          <div style={modalStyle} role="dialog" aria-modal="true" aria-labelledby="cancel-modal-title">
            <h3 id="cancel-modal-title" style={{ margin: '0 0 8px', color: '#fff', fontSize: 15 }}>Cancel challenge?</h3>
            <p style={{ margin: '0 0 12px', color: '#A5ACAF', fontSize: 13 }}>
              This will cancel <strong style={{ color: '#fff' }}>{cancelModal.name}</strong>.
              {cancelModal.status === 'active' && ' No further progress or completion events will be recorded after cancellation.'}
              {' '}This action cannot be undone.
            </p>
            <label style={{ display: 'grid', gap: 4, fontSize: 11, color: '#A5ACAF', marginBottom: 16 }}>
              Reason (optional)
              <input
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder="e.g. Criteria need adjustment"
                style={inputStyle}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => { setCancelModal(null); setCancelReason('') }} style={{ ...buttonStyle, background: '#1a2a3a' }}>Go back</button>
              <button type="button" onClick={() => cancelChallenge(cancelModal, cancelReason)} style={{ ...buttonStyle, background: '#5d2231' }}>Confirm cancel</button>
            </div>
          </div>
        </div>
      )}

      <Card title="Create draft challenge" badge={<Badge variant="amber">Pilot</Badge>}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.8fr .7fr .8fr .8fr auto', gap: 8, alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 11, color: '#A5ACAF' }}>
            Name
            <input value={createName} onChange={(event) => setCreateName(event.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 11, color: '#A5ACAF' }}>
            Threshold
            <input type="number" min={1} value={createThreshold} onChange={(event) => setCreateThreshold(Number(event.target.value))} style={inputStyle} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 11, color: '#A5ACAF' }}>
            Start
            <input type="date" value={createStart} onChange={(event) => setCreateStart(event.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 11, color: '#A5ACAF' }}>
            End
            <input type="date" value={createEnd} onChange={(event) => setCreateEnd(event.target.value)} style={inputStyle} />
          </label>
          <button type="button" onClick={createDraft} style={buttonStyle}>Create draft</button>
        </div>
      </Card>

      <Card
        title="Challenge list"
        badge={activeChallenge ? <Badge variant="green">Active: {activeChallenge.name}</Badge> : <Badge>No active challenge</Badge>}
      >
        {loading ? (
          <TableSkeleton columns={5} rows={4} />
        ) : !challenges.length ? (
          <div style={{ fontSize: 12, color: '#A5ACAF' }}>No challenges yet.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Threshold</th>
                <th>Window</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {challenges.map((challenge) => (
                <tr
                  key={challenge.id}
                  onClick={() => setSelectedChallengeId(challenge.id)}
                  style={{
                    cursor: 'pointer',
                    background: selectedChallengeId === challenge.id ? 'rgba(55,138,221,0.12)' : undefined,
                  }}
                >
                  <td style={{ fontWeight: 600 }}>{challenge.name}</td>
                  <td>{challenge.status}</td>
                  <td>{challenge.threshold_value}</td>
                  <td style={{ color: '#A5ACAF' }}>
                    {new Date(challenge.window_start_at).toLocaleDateString()} - {new Date(challenge.window_end_at).toLocaleDateString()}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {challenge.status === 'draft' && (
                      <button type="button" onClick={() => setActivateModal(challenge)} style={buttonStyle}>Activate</button>
                    )}
                    {(challenge.status === 'draft' || challenge.status === 'active') && (
                      <button type="button" onClick={() => { setCancelModal(challenge); setCancelReason('') }} style={{ ...buttonStyle, marginLeft: 8, background: '#5d2231' }}>
                        Cancel
                      </button>
                    )}
                    {challenge.status === 'active' && (
                      <button type="button" onClick={() => completeChallenge(challenge)} style={{ ...buttonStyle, marginLeft: 8, background: '#1f5f2f' }}>
                        Complete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 10 }}>
          <button type="button" onClick={runRecompute} style={buttonStyle}>Run recompute now</button>
        </div>
      </Card>

      {detail && (
        <Card title="Selected challenge details" badge={<Badge variant="wolf">{detail.challenge.status}</Badge>}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'grid', gap: 8 }}>
              {detailLoading ? (
                <div style={{ display: 'grid', gap: 10, minHeight: 180 }}>
                  <SkeletonBlock width="28%" height={10} radius={999} />
                  <SkeletonBlock width="100%" height={36} radius={8} />
                  <SkeletonBlock width="24%" height={10} radius={999} />
                  <SkeletonBlock width="100%" height={90} radius={8} />
                  <SkeletonBlock width="80%" height={10} radius={999} />
                  <SkeletonBlock width={112} height={30} radius={8} />
                </div>
              ) : (
                <>
                  <label style={{ display: 'grid', gap: 4, fontSize: 11, color: '#A5ACAF' }}>
                    Name
                    <input value={editName} onChange={(event) => setEditName(event.target.value)} style={inputStyle} />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 11, color: '#A5ACAF' }}>
                    Description
                    <textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} />
                  </label>
                  <div style={{ fontSize: 11, color: '#A5ACAF' }}>
                    {detail.challenge.status === 'active'
                      ? 'Active challenge: only name/description are editable.'
                      : detail.challenge.status === 'draft'
                        ? 'Draft challenge: full rule editing will be expanded in the next slice.'
                        : 'Terminal challenge: read-only.'}
                  </div>
                  {(detail.challenge.status === 'draft' || detail.challenge.status === 'active') && (
                    <button type="button" onClick={updateChallenge} style={buttonStyle}>Save metadata</button>
                  )}
                </>
              )}
            </div>
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
                <div className="kpi-card"><div className="sec-label">Participants</div><div style={{ fontSize: 20, fontWeight: 700 }}>{detail.summary.total_participants}</div></div>
                <div className="kpi-card"><div className="sec-label">Eligible</div><div style={{ fontSize: 20, fontWeight: 700 }}>{detail.summary.eligible_count}</div></div>
                <div className="kpi-card"><div className="sec-label">Completed</div><div style={{ fontSize: 20, fontWeight: 700 }}>{detail.summary.completed_count}</div></div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button type="button" style={buttonStyle} onClick={() => setParticipantStatus('all')}>All</button>
                <button type="button" style={buttonStyle} onClick={() => setParticipantStatus('completed')}>Completed</button>
                <button type="button" style={buttonStyle} onClick={() => setParticipantStatus('incomplete')}>Incomplete</button>
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #0a3560', borderRadius: 8 }}>
                {participantsLoading ? (
                  <div style={{ padding: 12 }}>
                    <TableSkeleton columns={4} rows={5} />
                  </div>
                ) : (
                  <table className="data-table" style={{ marginBottom: 0 }}>
                    <thead><tr><th>Participant</th><th>Eligible</th><th>Progress</th><th>Completed</th></tr></thead>
                    <tbody>
                      {participants.map((participant) => (
                        <tr key={participant.participant_id}>
                          <td>{participant.participant_id}</td>
                          <td>{participant.is_eligible ? 'Yes' : 'No'}</td>
                          <td>{participant.progress_value}</td>
                          <td>{participant.completed ? 'Yes' : 'No'}</td>
                        </tr>
                      ))}
                      {!participants.length && (
                        <tr><td colSpan={4} style={{ color: '#A5ACAF' }}>No participants for this filter.</td></tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

const inputStyle: CSSProperties = {
  background: '#001a33',
  border: '1px solid #0a3560',
  color: '#fff',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 12,
  fontFamily: 'Inter, sans-serif',
}

const buttonStyle: CSSProperties = {
  background: '#0a3560',
  color: '#fff',
  border: '1px solid #1e4f80',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.65)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}

const modalStyle: CSSProperties = {
  background: '#002244',
  border: '1px solid #0a3560',
  borderRadius: 12,
  padding: 24,
  maxWidth: 480,
  width: '100%',
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
}
