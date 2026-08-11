import { NextResponse } from 'next/server'
import { createServerSupabaseClient, getSession, getUserAccess } from '@/lib/supabase/server'
import { getDbEncryptionKey } from '@/lib/supabase/encryption'

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

function isParticipantTarget(targetType: string, targetLabel: string | null, participantId: string | null, currentParticipantId: string, cohort: string | null) {
  if (targetType === 'all') return true
  if (targetType === 'participant' && participantId === currentParticipantId) return true
  if (targetType === 'subgroup' && targetLabel === (cohort ?? '')) return true
  return false
}

function getResponseDueAt(weekOf: string) {
  const dueAt = new Date(`${weekOf}T00:00:00Z`)
  dueAt.setHours(dueAt.getHours() + 48)
  return dueAt
}

async function getTargetedNudge(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  participantId: string,
  cohort: string | null,
  weekOf: string,
) {
  const { data, error } = await supabase
    .from('weekly_nudges')
    .select('id, message, author, week_of, nudge_acknowledgement_targets!inner(target_type, target_label, participant_id)')
    .lte('week_of', weekOf)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) return { error }

  const rows = (data ?? []) as Array<{
    id: string
    message: string
    author: string
    week_of: string
    nudge_acknowledgement_targets: Array<{ target_type?: string; target_label?: string; participant_id?: string | null }> | { target_type?: string; target_label?: string; participant_id?: string | null }
  }>

  const nudge = rows.find((row) => {
    const targets = Array.isArray(row.nudge_acknowledgement_targets) ? row.nudge_acknowledgement_targets : [row.nudge_acknowledgement_targets]
    return targets.filter(Boolean).some((target) => isParticipantTarget(target?.target_type ?? 'all', target?.target_label ?? null, target?.participant_id ?? null, participantId, cohort))
  }) ?? null

  return { nudge }
}

export async function GET() {
  const participantAccess = await requireParticipantSession()
  if ('error' in participantAccess) return participantAccess.error

  const { supabase, participantId } = participantAccess
  
  // Fetch participant cohort for subgroup targeting
  const { data: participant, error: participantError } = await supabase
    .from('participants')
    .select('cohort')
    .eq('id', participantId)
    .maybeSingle()
  
  if (participantError) return NextResponse.json({ error: participantError.message }, { status: 500 })
  
  const today = new Date().toISOString().split('T')[0]
  const weekOf = mondayOfCurrentWeekIso()

  const [{ data: events, error: eventsError }, nudgeResult, { data: rsvps, error: rsvpError }] = await Promise.all([
    supabase
      .from('events')
      .select('*')
      .gte('event_date', today)
      .order('event_date', { ascending: true })
      .limit(5),
    getTargetedNudge(supabase, participantId, participant?.cohort ?? null, weekOf),
    supabase
      .from('event_rsvps')
      .select('event_id')
      .eq('participant_id', participantId),
  ])

  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 })
  if ('error' in nudgeResult && nudgeResult.error) return NextResponse.json({ error: nudgeResult.error.message }, { status: 500 })
  if (rsvpError) return NextResponse.json({ error: rsvpError.message }, { status: 500 })

  const nudge = 'nudge' in nudgeResult ? nudgeResult.nudge : null
  let acknowledgement = null
  if (nudge?.id) {
    const { data, error } = await supabase
      .from('nudge_acknowledgements')
      .select('acknowledged_at, response_text_encrypted, response_due_at')
      .eq('nudge_id', nudge.id)
      .eq('participant_id', participantId)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    
    if (data && data.response_text_encrypted) {
      // Decrypt the response using the stored procedure
      const { data: decrypted, error: decryptError } = await supabase
        .rpc('decrypt_nudge_response', {
          encrypted_data: data.response_text_encrypted,
          key: getDbEncryptionKey(),
        })
      if (decryptError) return NextResponse.json({ error: decryptError.message }, { status: 500 })
      acknowledgement = {
        acknowledged_at: data.acknowledged_at,
        response_text: decrypted,
        response_due_at: data.response_due_at,
      }
    }
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

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  // Validate JSON shape - must be an object with string fields
  if (typeof payload !== 'object' || payload === null) {
    return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 })
  }

  const nudgeId = typeof (payload as Record<string, unknown>).nudgeId === 'string' ? ((payload as Record<string, unknown>).nudgeId as string).trim() : ''
  const responseText = typeof (payload as Record<string, unknown>).responseText === 'string' ? ((payload as Record<string, unknown>).responseText as string).trim() : ''
  
  if (!nudgeId) {
    return NextResponse.json({ error: 'nudgeId is required and must be a string.' }, { status: 400 })
  }
  if (!responseText) {
    return NextResponse.json({ error: 'Response text is required and must be a non-empty string.' }, { status: 400 })
  }

  // Fetch participant cohort for subgroup targeting
  const { data: participant, error: participantError } = await supabase
    .from('participants')
    .select('cohort')
    .eq('id', participantId)
    .maybeSingle()
  
  if (participantError) return NextResponse.json({ error: participantError.message }, { status: 500 })

  const { data: nudge, error: nudgeError } = await supabase
    .from('weekly_nudges')
    .select('id, week_of, nudge_acknowledgement_targets!inner(target_type, target_label, participant_id)')
    .eq('id', nudgeId)
    .maybeSingle()

  if (nudgeError) return NextResponse.json({ error: nudgeError.message }, { status: 500 })
  if (!nudge) return NextResponse.json({ error: 'Nudge not found.' }, { status: 404 })

  const targetRows = Array.isArray((nudge as { nudge_acknowledgement_targets?: unknown }).nudge_acknowledgement_targets)
    ? (nudge as { nudge_acknowledgement_targets: Array<{ target_type?: string; target_label?: string; participant_id?: string | null }> }).nudge_acknowledgement_targets
    : [((nudge as { nudge_acknowledgement_targets?: { target_type?: string; target_label?: string; participant_id?: string | null } }).nudge_acknowledgement_targets ?? { target_type: 'all', target_label: null, participant_id: null })]

  const participantCohort = participant && 'cohort' in participant ? participant.cohort ?? null : null

  if (!targetRows.some((target) => isParticipantTarget(target.target_type ?? 'all', target.target_label ?? null, target.participant_id ?? null, participantId, participantCohort))) {
    return NextResponse.json({ error: 'Nudge not targeted to this participant.' }, { status: 403 })
  }

  const responseDueAt = getResponseDueAt(nudge.week_of)
  if (responseDueAt.getTime() < Date.now()) {
    return NextResponse.json({ error: 'Response window has closed.' }, { status: 403 })
  }

  // Use RPC to upsert encrypted acknowledgement
  const { data, error } = await supabase
    .rpc('upsert_nudge_acknowledgement', {
      p_nudge_id: nudgeId,
      p_participant_id: participantId,
      p_response_text: responseText,
      p_encryption_key: getDbEncryptionKey(),
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (data?.error) return NextResponse.json({ error: data.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
