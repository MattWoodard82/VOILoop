'use client'
import { useState, useEffect, useRef } from 'react'

interface Event {
  id: string
  title: string
  description: string
  event_date: string
  event_time: string
  location: string
  event_type: string
  recurring: boolean
  recurrence: string | null
}

interface Nudge {
  id: string
  week_of: string
  message: string
  author: string
  target_type?: string
  target_label?: string
}

interface Participant {
  id: string
  first_name: string
  last_name: string
}


const EVENT_TYPES = ['outdoor', 'fitness', 'race', 'general']

const TYPE_LABELS: Record<string, string> = {
  outdoor: '🥾 Outdoor',
  fitness: '🧘 Fitness',
  race: '🏆 Race',
  general: '📅 General',
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { error?: string }
    if (payload.error) return payload.error
  } catch {}
  return fallback
}

interface Acknowledgement {
  participant_id: string
  first_name: string
  last_name: string
  acknowledged_at: string
  response_text: string
}

export function AdminEventsClient() {
  const [events, setEvents] = useState<Event[]>([])
  const [nudges, setNudges] = useState<Nudge[]>([])
  const [acknowledgements, setAcknowledgements] = useState<Acknowledgement[]>([])
  const [tab, setTab] = useState<'events' | 'nudge' | 'responses'>('events')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const [newEvent, setNewEvent] = useState({
    title: '', description: '', event_date: '', event_time: '',
    location: '', event_type: 'general', recurring: false, recurrence: '',
  })

  const [nudgeMsg, setNudgeMsg] = useState('')
  const [nudgeAuthor, setNudgeAuthor] = useState('Heather Simpson')
  const [nudgeTargetType, setNudgeTargetType] = useState<'all' | 'subgroup' | 'participant'>('all')
  const [nudgeTargetLabel, setNudgeTargetLabel] = useState('')
  const [nudgeParticipantId, setNudgeParticipantId] = useState('')
  const [participants, setParticipants] = useState<Participant[]>([])
  const savedResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void loadData()
    return () => {
      if (savedResetTimeoutRef.current) {
        clearTimeout(savedResetTimeoutRef.current)
        savedResetTimeoutRef.current = null
      }
    }
  }, [])

  const triggerSavedState = () => {
    setSaved(true)
    if (savedResetTimeoutRef.current) {
      clearTimeout(savedResetTimeoutRef.current)
    }
    savedResetTimeoutRef.current = setTimeout(() => {
      setSaved(false)
      savedResetTimeoutRef.current = null
    }, 2000)
  }

  const loadData = async () => {
    const response = await fetch('/api/admin/events', { cache: 'no-store' })
    if (!response.ok) {
      const message = await parseErrorMessage(response, 'Unable to load events and nudges.')
      setError(`Unable to load events: ${message}`)
      return
    }
    const payload = await response.json() as { events?: Event[]; nudges?: Nudge[]; participants?: Participant[]; acknowledgements?: Acknowledgement[] }
    setEvents(payload.events ?? [])
    setNudges(payload.nudges ?? [])
    setParticipants(payload.participants ?? [])
    setAcknowledgements(payload.acknowledgements ?? [])
    setError('')
  }

  const saveEvent = async () => {
    if (!newEvent.title || !newEvent.event_date) return
    setSaving(true)
    const response = await fetch('/api/admin/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...newEvent,
        recurrence: newEvent.recurring ? newEvent.recurrence : null,
      }),
    })
    if (!response.ok) {
      const message = await parseErrorMessage(response, 'Unable to save event.')
      setError(`Unable to save event: ${message}`)
      setSaving(false)
      return
    }
    setNewEvent({ title: '', description: '', event_date: '', event_time: '', location: '', event_type: 'general', recurring: false, recurrence: '' })
    await loadData()
    setSaving(false)
    triggerSavedState()
  }

  const deleteEvent = async (id: string) => {
    const response = await fetch(`/api/admin/events/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      const message = await parseErrorMessage(response, 'Unable to delete event.')
      setError(`Unable to delete event: ${message}`)
      return
    }
    await loadData()
  }

  const saveNudge = async () => {
    if (!nudgeMsg) return
    setSaving(true)
    const response = await fetch('/api/admin/events', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: nudgeMsg,
        author: nudgeAuthor,
        target_type: nudgeTargetType,
        target_label: nudgeTargetLabel,
        participant_id: nudgeParticipantId,
      }),
    })
    if (!response.ok) {
      const message = await parseErrorMessage(response, 'Unable to publish nudge.')
      setError(`Unable to publish nudge: ${message}`)
      setSaving(false)
      return
    }
    setNudgeMsg('')
    setNudgeTargetLabel('')
    setNudgeParticipantId('')
    setNudgeTargetType('all')
    await loadData()
    setSaving(false)
    triggerSavedState()
  }

  const s = {
    card: { background: '#002244', border: '1px solid #0a3560', borderRadius: 10, padding: '18px 20px', marginBottom: 14 } as React.CSSProperties,
    label: { fontSize: 10, color: '#A5ACAF', textTransform: 'uppercase' as const, letterSpacing: '.06em', fontWeight: 600, marginBottom: 5, display: 'block' },
    input: { background: '#001a33', border: '1px solid #0a3560', borderRadius: 6, padding: '9px 12px', fontSize: 12, color: '#fff', fontFamily: 'Inter, sans-serif', width: '100%', outline: 'none', boxSizing: 'border-box' as const } as React.CSSProperties,
    btn: { background: '#69BE28', color: '#002244', border: 'none', borderRadius: 7, padding: '10px 20px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' } as React.CSSProperties,
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <div style={{ fontSize: 12, color: '#A5ACAF', marginBottom: 16 }}>
        Manage participant-facing events and weekly nudges from one admin workflow.
      </div>

      {error ? (
        <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,107,107,0.35)', background: 'rgba(255,107,107,0.08)', color: '#ffb4b4', fontSize: 12 }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['events', 'nudge', 'responses'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '7px 16px', borderRadius: 20, fontSize: 12, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
            background: tab === t ? '#69BE28' : 'transparent',
            color: tab === t ? '#002244' : '#A5ACAF',
            border: `1px solid ${tab === t ? '#69BE28' : '#0a3560'}`,
            fontWeight: tab === t ? 700 : 400,
          }}>
            {t === 'events' ? '📅 Events' : t === 'nudge' ? '💬 Weekly nudge' : `💌 Responses${acknowledgements.length > 0 ? ` · ${acknowledgements.length}` : ''}`}
          </button>
        ))}
      </div>

      {tab === 'events' && (
        <>
          <div style={s.card}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 14 }}>Create new event</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={s.label}>Event title *</label>
                <input style={s.input} placeholder="Group hike — Foothills Trail" value={newEvent.title}
                  onChange={e => setNewEvent(p => ({ ...p, title: e.target.value }))} />
              </div>
              <div>
                <label style={s.label}>Type</label>
                <select style={{ ...s.input, cursor: 'pointer' }} value={newEvent.event_type}
                  onChange={e => setNewEvent(p => ({ ...p, event_type: e.target.value }))}>
                  {EVENT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div>
                <label style={s.label}>Date *</label>
                <input style={s.input} type="date" value={newEvent.event_date}
                  onChange={e => setNewEvent(p => ({ ...p, event_date: e.target.value }))} />
              </div>
              <div>
                <label style={s.label}>Time</label>
                <input style={s.input} placeholder="7:00 AM" value={newEvent.event_time}
                  onChange={e => setNewEvent(p => ({ ...p, event_time: e.target.value }))} />
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={s.label}>Location</label>
              <input style={s.input} placeholder="Foothills Trail, Boise ID" value={newEvent.location}
                onChange={e => setNewEvent(p => ({ ...p, location: e.target.value }))} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={s.label}>Description</label>
              <textarea style={{ ...s.input, resize: 'vertical' } as React.CSSProperties} rows={2}
                placeholder="Details participants need to know..."
                value={newEvent.description}
                onChange={e => setNewEvent(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#A5ACAF', cursor: 'pointer' }}>
                <input type="checkbox" checked={newEvent.recurring}
                  onChange={e => setNewEvent(p => ({ ...p, recurring: e.target.checked }))} />
                Recurring event
              </label>
              {newEvent.recurring && (
                <input style={{ ...s.input, width: 'auto' }} placeholder="weekly / monthly"
                  value={newEvent.recurrence}
                  onChange={e => setNewEvent(p => ({ ...p, recurrence: e.target.value }))} />
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={saveEvent} disabled={saving || !newEvent.title || !newEvent.event_date} style={s.btn}>
                {saving ? 'Saving...' : 'Add event'}
              </button>
              {saved && <span style={{ fontSize: 12, color: '#69BE28' }}>✓ Saved</span>}
            </div>
          </div>

          <div style={s.card}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 12 }}>Upcoming events · {events.length} scheduled</div>
            {events.length === 0 && (
              <div style={{ fontSize: 12, color: '#A5ACAF', textAlign: 'center', padding: '20px 0' }}>No upcoming events. Create one above.</div>
            )}
            {events.map(event => (
              <div key={event.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: '1px solid #0a3560' }}>
                <div style={{ fontSize: 20 }}>{({ outdoor: '🥾', fitness: '🧘', race: '🏆', general: '📅' } as Record<string, string>)[event.event_type] ?? '📅'}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 2 }}>
                    {event.title}
                    {event.recurring && <span style={{ fontSize: 9, color: '#A5ACAF', background: '#001a33', borderRadius: 20, padding: '1px 6px', marginLeft: 6 }}>recurring</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#A5ACAF' }}>{event.event_date}{event.event_time ? ` · ${event.event_time}` : ''}{event.location ? ` · ${event.location}` : ''}</div>
                </div>
                <button onClick={() => deleteEvent(event.id)}
                  style={{ background: 'transparent', border: '1px solid #0a3560', borderRadius: 5, padding: '3px 8px', fontSize: 10, color: '#ff6b6b', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'nudge' && (
        <>
          <div style={s.card}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 4 }}>This week&apos;s nudge</div>
            <div style={{ fontSize: 11, color: '#A5ACAF', marginBottom: 14 }}>
              This message appears at the top of every participant&apos;s dashboard. Updated weekly.
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={s.label}>Message</label>
              <textarea style={{ ...s.input, resize: 'vertical' } as React.CSSProperties} rows={4}
                placeholder="Write this week&apos;s focus or encouragement for participants..."
                value={nudgeMsg}
                onChange={e => setNudgeMsg(e.target.value)} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>From</label>
              <input style={s.input} value={nudgeAuthor}
                onChange={e => setNudgeAuthor(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div>
                <label style={s.label}>Target</label>
                <select style={s.input} value={nudgeTargetType} onChange={e => setNudgeTargetType(e.target.value as 'all' | 'subgroup' | 'participant')}>
                  <option value="all">All participants</option>
                  <option value="subgroup">Subgroup</option>
                  <option value="participant">Individual participant</option>
                </select>
              </div>
              <div>
                <label style={s.label}>Label / participant</label>
                {nudgeTargetType === 'participant' ? (
                  <select style={{ ...s.input, cursor: 'pointer' }} value={nudgeParticipantId}
                    onChange={e => setNudgeParticipantId(e.target.value)}>
                    <option value="">— select participant —</option>
                    {participants.map(p => (
                      <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
                    ))}
                  </select>
                ) : (
                  <input style={s.input} value={nudgeTargetLabel}
                    onChange={e => setNudgeTargetLabel(e.target.value)}
                    placeholder={nudgeTargetType === 'subgroup' ? 'e.g. Team A' : ''} />
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={saveNudge} disabled={saving || !nudgeMsg} style={s.btn}>
                {saving ? 'Saving...' : 'Publish nudge'}
              </button>
              {saved && <span style={{ fontSize: 12, color: '#69BE28' }}>✓ Published</span>}
            </div>
          </div>

          <div style={s.card}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 12 }}>Previous nudges</div>
            {nudges.map(n => (
              <div key={n.id} style={{ padding: '10px 0', borderBottom: '1px solid #0a3560' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ fontSize: 10, color: '#69BE28', fontWeight: 600 }}>Week of {n.week_of}</div>
                  <div style={{ fontSize: 10, color: '#A5ACAF' }}>— {n.author}</div>
                </div>
                <div style={{ fontSize: 12, color: '#A5ACAF', lineHeight: 1.5 }}>{n.message}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'responses' && (
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 4 }}>Nudge responses · most recent nudge</div>
          <div style={{ fontSize: 11, color: '#A5ACAF', marginBottom: 14 }}>
            Participant reflections submitted for this week&apos;s nudge. Responses are decrypted for wellness director review only.
          </div>
          {acknowledgements.length === 0 ? (
            <div style={{ fontSize: 12, color: '#A5ACAF', textAlign: 'center', padding: '20px 0' }}>No responses yet for the most recent nudge.</div>
          ) : acknowledgements.map((ack, i) => (
            <div key={ack.participant_id} style={{ padding: '12px 0', borderBottom: i < acknowledgements.length - 1 ? '1px solid #0a3560' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{ack.first_name} {ack.last_name}</div>
                <div style={{ fontSize: 10, color: '#A5ACAF' }}>{new Date(ack.acknowledged_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              <div style={{ fontSize: 12, color: '#A5ACAF', lineHeight: 1.6, fontStyle: 'italic' }}>&ldquo;{ack.response_text}&rdquo;</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
