import { NextResponse } from 'next/server'
import { createServerSupabaseClient, getSession, getUserAccess } from '@/lib/supabase/server'

export const runtime = 'nodejs'

function mondayOfCurrentWeekIso() {
  const weekOf = new Date()
  weekOf.setDate(weekOf.getDate() - weekOf.getDay() + 1)
  return weekOf.toISOString().split('T')[0]
}

async function requireParticipantSession() {
  const session = await getSession()
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const access = await getUserAccess(session.user.id)
  if (access.role !== 'participant') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  const supabase = createServerSupabaseClient()
  const { data: participant, error } = await supabase
    .from('participants')
    .select('id')
    .eq('auth_user_id', session.user.id)
    .maybeSingle()

  if (error) {
    return { error: NextResponse.json({ error: error.message }, { status: 500 }) }
  }
  if (!participant) {
    return { error: NextResponse.json({ error: 'Participant profile not linked to account.' }, { status: 403 }) }
  }

  return { supabase, participantId: participant.id }
}

export async function GET() {
  const participantAccess = await requireParticipantSession()
  if ('error' in participantAccess) return participantAccess.error

  const { supabase, participantId } = participantAccess
  const today = new Date().toISOString().split('T')[0]
  const weekOf = mondayOfCurrentWeekIso()

  const [{ data: events, error: eventsError }, { data: nudge, error: nudgeError }, { data: rsvps, error: rsvpError }] = await Promise.all([
    supabase
      .from('events')
      .select('*')
      .gte('event_date', today)
      .order('event_date', { ascending: true })
      .limit(5),
    supabase
      .from('weekly_nudges')
      .select('message, author, week_of')
      .lte('week_of', weekOf)
      .order('week_of', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('event_rsvps')
      .select('event_id')
      .eq('participant_id', participantId),
  ])

  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 })
  if (nudgeError) return NextResponse.json({ error: nudgeError.message }, { status: 500 })
  if (rsvpError) return NextResponse.json({ error: rsvpError.message }, { status: 500 })

  return NextResponse.json({
    events: events ?? [],
    nudge: nudge ?? null,
    rsvpEventIds: (rsvps ?? []).map((entry) => entry.event_id),
  })
}

export async function POST(request: Request) {
  const participantAccess = await requireParticipantSession()
  if ('error' in participantAccess) return participantAccess.error

  const { supabase, participantId } = participantAccess

  let payload: { eventId?: string; going?: boolean }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const eventId = (payload.eventId ?? '').trim()
  if (!eventId) {
    return NextResponse.json({ error: 'eventId is required.' }, { status: 400 })
  }

  if (typeof payload.going !== 'boolean') {
    return NextResponse.json({ error: '`going` must be a boolean.' }, { status: 400 })
  }

  if (payload.going === true) {
    const { error } = await supabase
      .from('event_rsvps')
      .upsert({ event_id: eventId, participant_id: participantId }, { onConflict: 'event_id,participant_id', ignoreDuplicates: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase
      .from('event_rsvps')
      .delete()
      .eq('event_id', eventId)
      .eq('participant_id', participantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
