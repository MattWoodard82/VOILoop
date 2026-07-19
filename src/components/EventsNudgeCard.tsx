'use client'
import { useEffect, useState } from 'react'
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
  rsvp_enabled: boolean
}

interface Nudge {
  message: string
  author: string
  week_of: string
}

function isNoRowsError(error: { code?: string | null } | null): boolean {
  return error?.code === 'PGRST116'
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim().length > 0) {
      return message
    }
  }
  return String(error)
}

interface Props {
  participantId: string
}

const typeIcon: Record<string, string> = {
  outdoor: '🥾',
  fitness: '🧘',
  race: '🏆',
  general: '📅',
}

const typeColor: Record<string, string> = {
  outdoor: '#FFA500',
  fitness: '#69BE28',
  race: '#69BE28',
  general: '#A5ACAF',
}

function formatDate(d: string) {
  const date = new Date(d + 'T12:00:00')
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function daysUntil(d: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const event = new Date(d + 'T12:00:00')
  const diff = Math.round((event.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff < 0) return null
  return `In ${diff} days`
}

export function EventsNudgeCard({ participantId }: Props) {
  const [events, setEvents] = useState<Event[]>([])
  const [nudge, setNudge] = useState<Nudge | null>(null)
  const [rsvps, setRsvps] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadCardData = async () => {
      const supabase = createClient()
      const today = new Date().toISOString().split('T')[0]

      try {
        const { data: eventsData, error: eventsError } = await supabase
          .from('events')
          .select('*')
          .gte('event_date', today)
          .order('event_date', { ascending: true })
          .limit(5)

        if (eventsError) {
          throw eventsError
        }

        const weekOf = new Date()
        weekOf.setDate(weekOf.getDate() - weekOf.getDay() + 1)
        const weekStr = weekOf.toISOString().split('T')[0]
        const { data: nudgeData, error: nudgeError } = await supabase
          .from('weekly_nudges')
          .select('message, author, week_of')
          .lte('week_of', weekStr)
          .order('week_of', { ascending: false })
          .limit(1)
          .single()

        if (nudgeError && !isNoRowsError(nudgeError)) {
          throw nudgeError
        }

        const { data: rsvpData, error: rsvpError } = await supabase
          .from('event_rsvps')
          .select('event_id')
          .eq('participant_id', participantId)

        if (rsvpError) {
          throw rsvpError
        }

        setEvents(eventsData ?? [])
        setNudge(nudgeData ?? null)
        setRsvps(rsvpData?.map(r => r.event_id) ?? [])
        setError('')
      } catch (fetchError) {
        const message = getErrorMessage(fetchError)
        setError(`Events card failed to load. Detail: ${message}`)
      } finally {
        setLoading(false)
      }
    }
    void loadCardData()
  }, [participantId])

  const toggleRsvp = async (eventId: string) => {
    const supabase = createClient()
    const isRsvped = rsvps.includes(eventId)

    if (isRsvped) {
      const { error } = await supabase.from('event_rsvps').delete()
        .eq('event_id', eventId)
        .eq('participant_id', participantId)
      if (error) {
        setError(`RSVP update failed. Detail: ${error.message}`)
        return
      }
      setRsvps(prev => prev.filter(id => id !== eventId))
    } else {
      const { error } = await supabase.from('event_rsvps').insert({ event_id: eventId, participant_id: participantId })
      if (error) {
        setError(`RSVP update failed. Detail: ${error.message}`)
        return
      }
      setRsvps(prev => [...prev, eventId])
    }
  }

  if (loading) return null

  return (
    <div style={{ marginBottom: 14 }}>
      {error && (
        <div style={{ marginBottom: 10, padding: '10px 12px', background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: 8, color: '#ffb4b4', fontSize: 12 }}>
          {error}
        </div>
      )}

      {nudge && (
        <div style={{
          background: '#002244',
          border: '1px solid #0a3560',
          borderLeft: '3px solid #69BE28',
          borderRadius: 10,
          padding: '14px 18px',
          marginBottom: 10,
        }}>
          <div style={{ fontSize: 10, color: '#69BE28', textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 600, marginBottom: 6 }}>
            This week&apos;s focus · from {nudge.author}
          </div>
          <div style={{ fontSize: 13, color: '#fff', lineHeight: 1.6 }}>
            {nudge.message}
          </div>
        </div>
      )}

      {events.length > 0 && (
        <div style={{ background: '#002244', border: '1px solid #0a3560', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #0a3560', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>Upcoming events</div>
            <div style={{ fontSize: 10, color: '#A5ACAF' }}>{events.length} coming up</div>
          </div>

          {events.map((event, i) => {
            const isRsvped = rsvps.includes(event.id)
            const until = daysUntil(event.event_date)
            if (!until) return null
            const color = typeColor[event.event_type] ?? '#A5ACAF'
            const icon = typeIcon[event.event_type] ?? '📅'

            return (
              <div key={event.id} style={{
                padding: '12px 16px',
                borderBottom: i < events.length - 1 ? '1px solid #0a3560' : 'none',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: `${color}18`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, flex: '0 0 36px',
                }}>
                  {icon}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{event.title}</div>
                    {event.recurring && (
                      <span style={{ fontSize: 9, color: '#A5ACAF', background: '#001a33', border: '0.5px solid #0a3560', borderRadius: 20, padding: '1px 6px' }}>
                        {event.recurrence}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#A5ACAF', marginBottom: 4 }}>
                    {formatDate(event.event_date)}{event.event_time ? ` · ${event.event_time}` : ''}{event.location ? ` · ${event.location}` : ''}
                  </div>
                  {event.description && (
                    <div style={{ fontSize: 11, color: '#A5ACAF', lineHeight: 1.5, marginBottom: 6 }}>
                      {event.description}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flex: '0 0 auto' }}>
                  <div style={{ fontSize: 10, color: color, fontWeight: 600 }}>{until}</div>
                  {event.rsvp_enabled && (
                    <button
                      onClick={() => toggleRsvp(event.id)}
                      style={{
                        fontSize: 11, padding: '4px 12px', borderRadius: 20,
                        border: `1px solid ${isRsvped ? 'rgba(105,190,40,0.4)' : '#0a3560'}`,
                        background: isRsvped ? 'rgba(105,190,40,0.1)' : 'transparent',
                        color: isRsvped ? '#69BE28' : '#A5ACAF',
                        cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                        fontWeight: isRsvped ? 600 : 400, whiteSpace: 'nowrap',
                      }}
                    >
                      {isRsvped ? '✓ Going' : 'RSVP'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
