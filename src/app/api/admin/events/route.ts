import { NextResponse } from 'next/server'
import { createServerSupabaseClient, requireLeadership } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getDbEncryptionKey } from '@/lib/supabase/encryption'

export const runtime = 'nodejs'

interface EventPayload {
  title?: string
  description?: string
  event_date?: string
  event_time?: string
  location?: string
  event_type?: string
  recurring?: boolean
  recurrence?: string | null
}

interface NudgePayload {
  message?: string
  author?: string
  week_of?: string
  target_type?: 'all' | 'subgroup' | 'participant'
  target_label?: string
  participant_id?: string
}

interface EventRsvpSummary {
  participant_id: string
  first_name: string
  last_name: string
}

const VALID_EVENT_TYPES = new Set(['outdoor', 'fitness', 'race', 'general'])

function getMondayOfCurrentWeekIso(): string {
  const weekOf = new Date()
  weekOf.setDate(weekOf.getDate() - weekOf.getDay() + 1)
  return weekOf.toISOString().split('T')[0]
}

export async function GET() {
  const leadership = await requireLeadership()
  if ('redirect' in leadership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createServerSupabaseClient()
  const adminClient = createAdminSupabaseClient()
  const today = new Date().toISOString().split('T')[0]

  const [{ data: events, error: eventsError }, { data: nudges, error: nudgesError }, { data: participants, error: participantsError }, { data: rsvps, error: rsvpsError }] = await Promise.all([
    supabase
      .from('events')
      .select('*')
      .gte('event_date', today)
      .order('event_date', { ascending: true }),
    supabase
      .from('weekly_nudges')
      .select('*')
      .order('week_of', { ascending: false })
      .limit(8),
    adminClient
      .from('participants')
      .select('id, first_name, last_name')
      .eq('status', 'Active')
      .order('last_name', { ascending: true }),
    adminClient
      .from('event_rsvps')
      .select('event_id, participant_id'),
  ])

  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 })
  }
  if (nudgesError) {
    return NextResponse.json({ error: nudgesError.message }, { status: 500 })
  }
  if (participantsError) {
    return NextResponse.json({ error: participantsError.message }, { status: 500 })
  }
  if (rsvpsError) {
    return NextResponse.json({ error: rsvpsError.message }, { status: 500 })
  }

  const recentNudge = nudges?.[0] ?? null
  const participantMap = new Map((participants ?? []).map((participant) => [participant.id, participant]))
  const rsvpsByEventId = new Map<string, EventRsvpSummary[]>()
  for (const rsvp of rsvps ?? []) {
    const participant = participantMap.get(rsvp.participant_id)
    if (!participant) continue
    const eventRsvps = rsvpsByEventId.get(rsvp.event_id) ?? []
    eventRsvps.push({
      participant_id: rsvp.participant_id,
      first_name: participant.first_name,
      last_name: participant.last_name,
    })
    rsvpsByEventId.set(rsvp.event_id, eventRsvps)
  }
  const MAX_DISPLAYED_ACKNOWLEDGEMENTS = 50
  let acknowledgements: Array<{ participant_id: string; first_name: string; last_name: string; acknowledged_at: string; response_text: string }> = []
  let acknowledgementsTotal = 0
  if (recentNudge) {
    const { count: totalCount, error: countError } = await adminClient
      .from('nudge_acknowledgements')
      .select('*', { count: 'exact', head: true })
      .eq('nudge_id', recentNudge.id)

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 })
    }
    acknowledgementsTotal = totalCount ?? 0

    const { data: acks, error: acknowledgementsError } = await adminClient
      .from('nudge_acknowledgements')
      .select('participant_id, acknowledged_at, response_text_encrypted')
      .eq('nudge_id', recentNudge.id)
      .order('acknowledged_at', { ascending: false })
      .limit(MAX_DISPLAYED_ACKNOWLEDGEMENTS)

    if (acknowledgementsError) {
      return NextResponse.json({ error: acknowledgementsError.message }, { status: 500 })
    }
    if (acks && acks.length > 0) {
      acknowledgements = await Promise.all(acks.map(async (ack) => {
        let responseText = ''
        if (ack.response_text_encrypted) {
          const { data: decrypted, error: decryptError } = await adminClient.rpc('decrypt_nudge_response', {
            encrypted_data: ack.response_text_encrypted,
            key: getDbEncryptionKey(),
          })
          if (decryptError) {
            throw decryptError
          }
          responseText = decrypted ?? ''
        }
        const participant = participantMap.get(ack.participant_id)
        return {
          participant_id: ack.participant_id,
          first_name: participant?.first_name ?? 'Unknown',
          last_name: participant?.last_name ?? '',
          acknowledged_at: ack.acknowledged_at,
          response_text: responseText,
        }
      }))
    }
  }

  return NextResponse.json({
    events: (events ?? []).map((event) => ({
      ...event,
      rsvps: rsvpsByEventId.get(event.id) ?? [],
    })),
    nudges: nudges ?? [],
    participants: participants ?? [],
    acknowledgements,
    acknowledgements_total: acknowledgementsTotal,
    recent_nudge_id: recentNudge?.id ?? null,
  })
}

export async function POST(request: Request) {
  const leadership = await requireLeadership()
  if ('redirect' in leadership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let payload: EventPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const title = (payload.title ?? '').trim()
  const eventDate = (payload.event_date ?? '').trim()
  const eventType = (payload.event_type ?? 'general').trim()
  if (!title || !eventDate) {
    return NextResponse.json({ error: 'Event title and date are required.' }, { status: 400 })
  }
  if (!VALID_EVENT_TYPES.has(eventType)) {
    return NextResponse.json({ error: 'Invalid event type.' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const { error } = await supabase
    .from('events')
    .insert({
      title,
      description: (payload.description ?? '').trim(),
      event_date: eventDate,
      event_time: (payload.event_time ?? '').trim(),
      location: (payload.location ?? '').trim(),
      event_type: eventType,
      recurring: Boolean(payload.recurring),
      recurrence: payload.recurring ? (payload.recurrence ?? '').trim() || null : null,
    })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function PUT(request: Request) {
  const leadership = await requireLeadership()
  if ('redirect' in leadership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let payload: NudgePayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const message = (payload.message ?? '').trim()
  const author = (payload.author ?? '').trim() || 'VOILoop'
  const weekOf = (payload.week_of ?? '').trim() || getMondayOfCurrentWeekIso()
  const targetType = payload.target_type ?? 'all'
  const targetLabel = (payload.target_label ?? '').trim()
  const participantId = (payload.participant_id ?? '').trim()
  if (!message) {
    return NextResponse.json({ error: 'Nudge message is required.' }, { status: 400 })
  }
  if (!['all', 'subgroup', 'participant'].includes(targetType)) {
    return NextResponse.json({ error: 'Invalid target type.' }, { status: 400 })
  }
  if (targetType === 'subgroup' && !targetLabel) {
    return NextResponse.json({ error: 'Target label is required for subgroup nudges.' }, { status: 400 })
  }
  if (targetType === 'participant' && !participantId) {
    return NextResponse.json({ error: 'Participant id is required for individual nudges.' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  
  // Delete old targets for this nudge (republishing clears old targeting)
  // Then persist new nudge + target atomically via RPC
  const { data: result, error: rpcError } = await supabase.rpc('upsert_nudge_with_target', {
    p_week_of: weekOf,
    p_message: message,
    p_author: author,
    p_target_type: targetType,
    p_target_label: targetLabel || '',
    p_participant_id: targetType === 'participant' ? participantId : null,
  })

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 })
  }
  if (!result?.nudge_id) {
    return NextResponse.json({ error: 'Failed to persist nudge and target.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, nudge_id: result.nudge_id })
}
