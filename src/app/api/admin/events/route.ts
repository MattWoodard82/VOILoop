import { NextResponse } from 'next/server'
import { createServerSupabaseClient, requireAdmin } from '@/lib/supabase/server'
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

const VALID_EVENT_TYPES = new Set(['outdoor', 'fitness', 'race', 'general'])

function getMondayOfCurrentWeekIso(): string {
  const weekOf = new Date()
  weekOf.setDate(weekOf.getDate() - weekOf.getDay() + 1)
  return weekOf.toISOString().split('T')[0]
}

export async function GET() {
  const admin = await requireAdmin()
  if ('redirect' in admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createServerSupabaseClient()
  const adminClient = createAdminSupabaseClient()
  const today = new Date().toISOString().split('T')[0]

  const [{ data: events, error: eventsError }, { data: nudges, error: nudgesError }, { data: participants, error: participantsError }] = await Promise.all([
    supabase
      .from('events')
      .select('*')
      .gte('event_date', today)
      .order('event_date', { ascending: true }),
    supabase
      .from('weekly_nudges')
      .select('id, week_of, message, author, created_at, updated_at, response_due_at, nudge_acknowledgement_targets(target_type, target_label, participant_id)')
      .order('created_at', { ascending: false })
      .limit(8),
    adminClient
      .from('participants')
      .select('id, first_name, last_name')
      .eq('status', 'Active')
      .order('last_name', { ascending: true }),
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

  // Fetch acknowledgements for the recent nudges list. This preserves visibility
  // when older responses exist and also keeps legacy/stranded weekly_nudges rows
  // visible to admins even if a target row is missing.
  const recentNudges = nudges ?? []
  const recentNudgeIds = recentNudges.map((nudge) => nudge.id).filter(Boolean)
  let acknowledgements: Array<{ participant_id: string; first_name: string; last_name: string; acknowledged_at: string; response_text: string }> = []
  if (recentNudgeIds.length > 0) {
    const { data: acks } = await adminClient
      .from('nudge_acknowledgements')
      .select('nudge_id, participant_id, acknowledged_at, response_text_encrypted')
      .in('nudge_id', recentNudgeIds)
      .order('acknowledged_at', { ascending: false })

    if (acks && acks.length > 0) {
      const participantMap = new Map((participants ?? []).map(p => [p.id, p]))
      const decrypted = await Promise.all(acks.map(async (ack) => {
        let response_text = ''
        if (ack.response_text_encrypted) {
          const { data } = await adminClient.rpc('decrypt_nudge_response', {
            encrypted_data: ack.response_text_encrypted,
            key: getDbEncryptionKey(),
          })
          response_text = data ?? ''
        }
        const p = participantMap.get(ack.participant_id)
        return {
          participant_id: ack.participant_id,
          first_name: p?.first_name ?? 'Unknown',
          last_name: p?.last_name ?? '',
          acknowledged_at: ack.acknowledged_at,
          response_text,
        }
      }))
      acknowledgements = decrypted
    }
  }

  const normalizedNudges = (nudges ?? []).map((nudge) => {
    const targets = Array.isArray((nudge as { nudge_acknowledgement_targets?: unknown }).nudge_acknowledgement_targets)
      ? (nudge as { nudge_acknowledgement_targets: Array<{ target_type?: string; target_label?: string; participant_id?: string | null }> }).nudge_acknowledgement_targets
      : [((nudge as { nudge_acknowledgement_targets?: { target_type?: string; target_label?: string; participant_id?: string | null } }).nudge_acknowledgement_targets ?? {})]
    const primaryTarget = targets.find(Boolean) ?? {}
    return {
      ...nudge,
      target_type: primaryTarget.target_type ?? 'all',
      target_label: primaryTarget.target_label ?? '',
      participant_id: primaryTarget.participant_id ?? null,
    }
  })

  return NextResponse.json({
    events: events ?? [],
    nudges: normalizedNudges,
    participants: participants ?? [],
    acknowledgements,
    recent_nudge_id: normalizedNudges[0]?.id ?? null,
    diagnostics: {
      nudge_count: normalizedNudges.length,
      acknowledgement_count: acknowledgements.length,
      missing_target_rows: normalizedNudges.some((nudge) => !(nudge as { target_type?: string }).target_type),
    },
  })
}

export async function POST(request: Request) {
  const admin = await requireAdmin()
  if ('redirect' in admin) {
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
  const admin = await requireAdmin()
  if ('redirect' in admin) {
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
  const { data: result, error: rpcError } = await supabase.rpc('upsert_nudge_with_engagement_target', {
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
