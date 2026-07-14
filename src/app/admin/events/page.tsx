'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

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
}

const EVENT_TYPES = ['outdoor', 'fitness', 'race', 'general']
const TYPE_LABELS: Record<string, string> = {
  outdoor: '🥾 Outdoor',
  fitness: '🧘 Fitness',
  race: '🏆 Race',
  general: '📅 General',
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [nudges, setNudges] = useState<Nudge[]>([])
  const [tab, setTab] = useState<'events' | 'nudge'>('events')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [newEvent, setNewEvent] = useState({
    title: '', description: '', event_date: '', event_time: '',
    location: '', event_type: 'general', recurring: false, recurrence: '',
  })

  const [nudgeMsg, setNudgeMsg] = useState('')
  const [nudgeAuthor, setNudgeAuthor] = useState('Heather Simpson')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    const { data: eventsData } = await supabase
      .from('events').select('*').gte('event_date', today).order('event_date')
    const { data: nudgesData } = await supabase
      .from('weekly_nudges').select('*').order('week_of', { ascending: false }).limit(8)
    setEvents(eventsData ?? [])
    setNudges(nudgesData ?? [])
  }

  const saveEvent = async () => {
    if (!newEvent.title || !newEvent.event_date) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('events').insert({
      ...newEvent,
      recurrence: newEvent.recurring ? newEvent.recurrence : null,
    })
    setNewEvent({ title: '', description: '', event_date: '', event_time: '', location: '', event_type: 'general', recurring: false, recurrence: '' })
    await loadData()
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const deleteEvent = async (id: string) => {
    const supabase = createClient()
    await supabase.from('events').delete().eq('id', id)
    await loadData()
  }

  const saveNudge = async () => {
    if (!nudgeMsg) return
    setSaving(true)
    const supabase = createClient()
    const weekOf = new Date()
    weekOf.setDate(weekOf.getDate() - weekOf.getDay() + 1)
    const weekStr = weekOf.toISOString().split('T')[0]
    await supabase.from('weekly_nudges').upsert({
      week_of: weekStr, message: nudgeMsg, author: nudgeAuthor,
    }, { onConflict: 'week_of' })
    setNudgeMsg('')
    await loadData()
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const s = {
    page: { minHeight: '100vh', background: '#0d1f35', fontFamily: 'Inter, sans-serif', padding: '24px' } as React.CSSProperties,
    card: { background: '#002244', border: '1px solid #0a3560', borderRadius: 10, padding: '18px 20px', marginBottom: 14 } as React.CSSProperties,
    label: { fontSize: 10, color: '#A5ACAF', textTransform: 'uppercase' as const, letterSpacing: '.06em', fontWeight: 600, marginBottom: 5, display: 'block' },
    input: { background: '#001a33', border: '1px solid #0a3560', borderRadius: 6, padding: '9px 12px', fontSize: 12, color: '#fff', fontFamily: 'Inter, sans-serif', width: '100%', outline: 'none', boxSizing: 'border-box' as const } as React.CSSProperties,
    btn: { background: '#69BE28', color: '#002244', border: 'none', borderRadius: 7, padding: '10px 20px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' } as React.CSSProperties,
  }

  return (
    <div style={s.page}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 18, color: '#69BE28' }}>VOI</span>
            <span style={{ fontWeight: 300, fontSize: 18, color: '#fff' }}>Loop</span>
          </div>
          <span style={{ fontSize: 11, color: '#0a3560' }}>|</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>Events and nudges</span>
          <span style={{ fontSize: 11, color: '#A5ACAF', marginLeft: 4 }}>Admin only</span>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['events', 'nudge'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '7px 16px', borderRadius: 20, fontSize: 12, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              background: tab === t ? '#69BE28' : 'transparent',
              color: tab === t ? '#002244' : '#A5ACAF',
              border: `1px solid ${tab === t ? '#69BE28' : '#0a3560'}`,
              fontWeight: tab === t ? 700 : 400,
            }}>
              {t === 'events' ? '📅 Events' : '💬 Weekly nudge'}
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
                  <div style={{ fontSize: 20 }}>{({ outdoor:'🥾', fitness:'🧘', race:'🏆', general:'📅' } as any)[event.event_type] ?? '📅'}</div>
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
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 4 }}>This week's nudge</div>
              <div style={{ fontSize: 11, color: '#A5ACAF', marginBottom: 14 }}>
                This message appears at the top of every participant's dashboard. Updated weekly.
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={s.label}>Message</label>
                <textarea style={{ ...s.input, resize: 'vertical' } as React.CSSProperties} rows={4}
                  placeholder="Write this week's focus or encouragement for participants..."
                  value={nudgeMsg}
                  onChange={e => setNudgeMsg(e.target.value)} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={s.label}>From</label>
                <input style={s.input} value={nudgeAuthor}
                  onChange={e => setNudgeAuthor(e.target.value)} />
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
      </div>
    </div>
  )
}
