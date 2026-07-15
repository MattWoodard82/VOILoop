'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Alert, Badge, Card } from '@/components/ui'
import { parseFrontendError } from '@/lib/frontend-error'

type Challenge = {
  id: string
  name: string
  description: string | null
  status: 'draft' | 'active' | 'completed' | 'cancelled'
  threshold_value: number
  window_start_at: string
  window_end_at: string
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
  employee_id: string
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

  const activeChallenge = useMemo(() => challenges.find((challenge) => challenge.status === 'active') ?? null, [challenges])

  const setErrorFromResponse = async (response: Response, fallbackMessage: string) => {
    const parsed = await parseFrontendError(response, fallbackMessage)
    const detail = parsed.detail ? ` (${parsed.detail})` : ''
    setError(`${parsed.message}${detail}`)
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
        eligibility_mode: 'all_employees',
      }),
    })
    if (!response.ok) {
      await setErrorFromResponse(response, 'Failed to create challenge')
      return
    }
    await loadChallenges()
  }

  const loadDetail = async (challengeId: string) => {
    const response = await fetch(`/api/admin/challenges/${challengeId}`, { cache: 'no-store' })
    if (!response.ok) {
      await setErrorFromResponse(response, 'Failed to load challenge details')
      return
    }
    const payload = await response.json()
    setDetail(payload as ChallengeDetail)
    setEditName(payload.challenge.name ?? '')
    setEditDescription(payload.challenge.description ?? '')
  }

  const loadParticipants = async (challengeId: string, status: 'all' | 'completed' | 'incomplete') => {
    const query = status === 'all' ? '' : `?status=${status}`
    const response = await fetch(`/api/admin/challenges/${challengeId}/participants${query}`, { cache: 'no-store' })
    if (!response.ok) {
      await setErrorFromResponse(response, 'Failed to load participants')
      return
    }
    const payload = await response.json()
    setParticipants(payload.participants ?? [])
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
    await loadChallenges()
  }

  const cancelChallenge = async (challenge: Challenge) => {
    setError(null)
    const response = await fetch(`/api/admin/challenges/${challenge.id}/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: challenge.version, reason: 'cancelled during pilot validation' }),
    })
    if (!response.ok) {
      await setErrorFromResponse(response, 'Failed to cancel challenge')
      return
    }
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
          <div style={{ fontSize: 12, color: '#A5ACAF' }}>Loading…</div>
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
                      <button type="button" onClick={() => activateChallenge(challenge)} style={buttonStyle}>Activate</button>
                    )}
                    {(challenge.status === 'draft' || challenge.status === 'active') && (
                      <button type="button" onClick={() => cancelChallenge(challenge)} style={{ ...buttonStyle, marginLeft: 8, background: '#5d2231' }}>
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
                <table className="data-table" style={{ marginBottom: 0 }}>
                  <thead><tr><th>Employee</th><th>Eligible</th><th>Progress</th><th>Completed</th></tr></thead>
                  <tbody>
                    {participants.map((participant) => (
                      <tr key={participant.employee_id}>
                        <td>{participant.employee_id}</td>
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
