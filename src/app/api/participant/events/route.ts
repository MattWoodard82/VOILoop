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

function isParticipantTarget(targetType: string, participantId: string | null, currentParticipantId: string) {
  return targetType === 'all' || (targetType === 'participant' && participantId === currentParticipantId)
}

function getResponseDueAt(weekOf: string) {
  const dueAt = new Date(`${weekOf}T00:00:00Z`)
  dueAt.setHours(dueAt.getHours() + 48)
  return dueAt
}

async function getTargetedNudge(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  participantId: string,
  weekOf: string,
) {
  const { data, error } = await supabase
    .from('weekly_nudges')
    .select('id, message, author, week_of, nudge_targets!inner(target_type, participant_id)')
    .lte('week_of', weekOf)
    .order('week_of', { ascending: false })
    .limit(10)

  if (error) return { error }

  const rows = (data ?? []) as Array<{
    id: string
    message: string
    author: string
    week_of: string
    nudge_targets: Array<{ target_type?: string; participant_id?: string | null }> | { target_type?: string; participant_id?: string | null }
  }>

  const nudge = rows.find((row) => {
    const targets = Array.isArray(row.nudge_targets) ? row.nudge_targets : [row.nudge_targets]
    return targets.filter(Boolean).some((target) => isParticipantTarget(target?.target_type ?? 'all', target?.participant_id ?? null, participantId))
  }) ?? null

  return { nudge }
}

export async function GET() {
  const participantAccess = await requireParticipantSession()
  if ('error' in participantAccess) return participantAccess.error

  const { supabase, participantId } = participantAccess
  const today = new Date().toISOString().split('T')[0]
  const weekOf = mondayOfCurrentWeekIso()

  const [{ data: events, error: eventsError }, nudgeResult, { data: rsvps, error: rsvpError }] = await Promise.all([
    supabase
      .from('events')
      .select('*')
      .gte('event_date', today)
      .order('event_date', { ascending: true })
      .limit(5),
    getTargetedNudge(supabase, participantId, weekOf),
    supabase
      .from('event_rsvps')
      .select('event_id')
      .eq('participant_id', participantId),
  ])

  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 })
  if ('error' in nudgeResult) return NextResponse.json({ error: nudgeResult.error.message }, { status: 500 })
  if (rsvpError) return NextResponse.json({ error: rsvpError.message }, { status: 500 })

  const nudge = 'nudge' in nudgeResult ? nudgeResult.nudge : null
  let acknowledgement = null
  if (nudge?.id) {
    const { data, error } = await supabase
      .from('nudge_acknowledgements')
      .select('acknowledged_at, response_text, response_due_at')
      .eq('nudge_id', nudge.id)
      .eq('participant_id', participantId)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    acknowledgement = data
  }

  return NextResponse.json({
    events: events ?? [],
    nudge,
    acknowledgement,
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

export async function PATCH(request: Request) {
  const participantAccess = await requireParticipantSession()
  if ('error' in participantAccess) return participantAccess.error

  const { supabase, participantId } = participantAccess

  let payload: { nudgeId?: string; responseText?: string }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const nudgeId = (payload.nudgeId ?? '').trim()
  const responseText = (payload.responseText ?? '').trim()
  if (!nudgeId) {
    return NextResponse.json({ error: 'nudgeId is required.' }, { status: 400 })
  }
  if (!responseText) {
    return NextResponse.json({ error: 'Response text is required.' }, { status: 400 })
  }

  const { data: nudge, error: nudgeError } = await supabase
    .from('weekly_nudges')
    .select('id, week_of, nudge_targets!inner(target_type, participant_id)')
    .eq('id', nudgeId)
    .maybeSingle()

  if (nudgeError) return NextResponse.json({ error: nudgeError.message }, { status: 500 })
  if (!nudge) return NextResponse.json({ error: 'Nudge not found.' }, { status: 404 })

  const targetRows = Array.isArray((nudge as { nudge_targets?: unknown }).nudge_targets)
    ? (nudge as { nudge_targets: Array<{ target_type?: string; participant_id?: string | null }> }).nudge_targets
    : [((nudge as { nudge_targets?: { target_type?: string; participant_id?: string | null } }).nudge_targets ?? { target_type: 'all', participant_id: null })]

  if (!targetRows.some((target) => isParticipantTarget(target.target_type ?? 'all', target.participant_id ?? null, participantId))) {
    return NextResponse.json({ error: 'Nudge not targeted to this participant.' }, { status: 403 })
  }

  const responseDueAt = getResponseDueAt(nudge.week_of)
  if (responseDueAt.getTime() < Date.now()) {
    return NextResponse.json({ error: 'Response window has closed.' }, { status: 403 })
  }

  const { error } = await supabase
    .from('nudge_acknowledgements')
    .upsert({
      nudge_id: nudgeId,
      participant_id: participantId,
      response_text: responseText,
      acknowledged_at: new Date().toISOString(),
      response_due_at: responseDueAt.toISOString(),
    }, { onConflict: 'nudge_id,participant_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
