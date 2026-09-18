import { NextResponse } from 'next/server'
import { createServerSupabaseClient, getSession, getUserAccess } from '@/lib/supabase/server'
import { getDbEncryptionKey } from '@/lib/supabase/encryption'

export const runtime = 'nodejs'

// Number of past targeted nudges to retain for reference in the participant's
// nudge history (in addition to the current/newest one). Matches the admin
// console's expanded nudge list (see MAX_DISPLAYED_NUDGES in
// src/app/api/admin/events/route.ts).
const MAX_NUDGE_HISTORY = 50

interface TargetedNudgeRow {
  id: string
  message: string
  author: string
  week_of: string
}

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

interface StructuredErrorPayload {
  error: string
  detail: string
  code?: string
  requestId: string
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

function generateRequestId(): string {
  return `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

// Builds the client-facing error payload for a failed acknowledgement save.
// IMPORTANT: raw Postgres/Supabase error fields (message/details/hint) can leak
// function names, roles, and schema details and must never be sent to the
// client — log the raw source at the call site instead, and correlate with
// the requestId returned here.
function buildStructuredAckError(
  summary: string,
  status: number,
  code: unknown,
  requestId: string,
): StructuredErrorPayload {
  const payload: StructuredErrorPayload = {
    error: summary,
    detail: `HTTP: ${status}`,
    requestId,
  }
  const codeStr = asString(code)
  if (codeStr) payload.code = codeStr
  return payload
}

async function getTargetedNudges(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  participantId: string,
  cohort: string | null,
  weekOf: string,
) {
  const { data: targetedRows, error: targetedError } = await supabase
    .from('nudge_targets')
    .select('nudge_id, target_type, target_label, participant_id')
    .or(`target_type.eq.all,and(target_type.eq.participant,participant_id.eq.${participantId}),and(target_type.eq.subgroup,target_label.eq.${cohort ?? ''})`)

  if (targetedError) return { error: targetedError }

  const targetedNudgeIds = Array.from(new Set((targetedRows ?? []).map((row) => row.nudge_id).filter(Boolean)))
  if (!targetedNudgeIds.length) {
    return { nudges: [] as TargetedNudgeRow[] }
  }

  const { data, error } = await supabase
    .from('weekly_nudges')
    .select('id, message, author, week_of')
    .in('id', targetedNudgeIds)
    .lte('week_of', weekOf)
    .order('week_of', { ascending: false })
    .limit(MAX_NUDGE_HISTORY)

  if (error) return { error }

  const rows = (data ?? []) as TargetedNudgeRow[]

  // Most-recent-first list of every nudge actually targeted to this participant
  // (by "all", their specific participant id, or their cohort subgroup). The
  // first entry (if any) is the participant's current/newest nudge; the rest
  // are retained for reference only - see getTargetedNudges callers.
  const nudges = rows.filter((row) =>
    targetedRows?.some((target) =>
      target.nudge_id === row.id &&
      isParticipantTarget(target.target_type ?? 'all', target.target_label ?? null, target.participant_id ?? null, participantId, cohort))
  )

  return { nudges }
}

interface DecryptedAcknowledgement {
  acknowledged_at: string
  response_text: string
  response_due_at: string
}

async function loadDecryptedAcknowledgement(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  nudgeId: string,
  participantId: string,
): Promise<{ acknowledgement: DecryptedAcknowledgement | null } | { error: { message: string } }> {
  const { data, error } = await supabase
    .from('nudge_acknowledgements')
    .select('acknowledged_at, response_text_encrypted, response_due_at')
    .eq('nudge_id', nudgeId)
    .eq('participant_id', participantId)
    .maybeSingle()
  if (error) return { error }

  if (!data || !data.response_text_encrypted) {
    return { acknowledgement: null }
  }

  // Decrypt the response using the stored procedure
  const { data: decrypted, error: decryptError } = await supabase
    .rpc('decrypt_nudge_response', {
      encrypted_data: data.response_text_encrypted,
      key: getDbEncryptionKey(),
    })
  if (decryptError) return { error: decryptError }

  return {
    acknowledgement: {
      acknowledged_at: data.acknowledged_at,
      response_text: decrypted,
      response_due_at: data.response_due_at,
    },
  }
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

  const [{ data: events, error: eventsError }, nudgesResult, { data: rsvps, error: rsvpError }] = await Promise.all([
    supabase
      .from('events')
      .select('*')
      .gte('event_date', today)
      .order('event_date', { ascending: true })
      .limit(5),
    getTargetedNudges(supabase, participantId, participant?.cohort ?? null, weekOf),
    supabase
      .from('event_rsvps')
      .select('event_id')
      .eq('participant_id', participantId),
  ])

  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 })
  if ('error' in nudgesResult && nudgesResult.error) return NextResponse.json({ error: nudgesResult.error.message }, { status: 500 })
  if (rsvpError) return NextResponse.json({ error: rsvpError.message }, { status: 500 })

  // The first (most recent) targeted nudge is the "current" one, repliable via
  // PATCH. Any older targeted nudges are retained here as read-only history -
  // they remain visible for reference, but only the current nudge can be
  // acknowledged/replied to (see PATCH below).
  const nudges = 'nudges' in nudgesResult ? nudgesResult.nudges : []
  const nudge = nudges[0] ?? null
  const historyNudges = nudges.slice(1)

  let acknowledgement = null
  if (nudge?.id) {
    const result = await loadDecryptedAcknowledgement(supabase, nudge.id, participantId)
    if ('error' in result) return NextResponse.json({ error: result.error.message }, { status: 500 })
    acknowledgement = result.acknowledgement
  }

  const history: Array<TargetedNudgeRow & { acknowledgement: DecryptedAcknowledgement | null }> = []
  for (const historyNudge of historyNudges) {
    const result = await loadDecryptedAcknowledgement(supabase, historyNudge.id, participantId)
    if ('error' in result) return NextResponse.json({ error: result.error.message }, { status: 500 })
    history.push({ ...historyNudge, acknowledgement: result.acknowledgement })
  }

  return NextResponse.json({
    events: events ?? [],
    nudge,
    acknowledgement,
    history,
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
    .select('id, week_of, response_due_at')
    .eq('id', nudgeId)
    .maybeSingle()

  if (nudgeError) return NextResponse.json({ error: nudgeError.message }, { status: 500 })
  if (!nudge) return NextResponse.json({ error: 'Nudge not found.' }, { status: 404 })

  const { data: targetRows, error: targetError } = await supabase
    .from('nudge_targets')
    .select('target_type, target_label, participant_id')
    .eq('nudge_id', nudgeId)

  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 })

  if (!(targetRows ?? []).some((target) => isParticipantTarget(target.target_type ?? 'all', target.target_label ?? null, target.participant_id ?? null, participantId, participant?.cohort ?? null))) {
    return NextResponse.json({ error: 'Nudge not targeted to this participant.' }, { status: 403 })
  }

  // Old nudges are retained for reference, but only the participant's current
  // (newest targeted) nudge accepts replies - prevents the confusing case where
  // a stale nudge stays visible/repliable-looking after a newer one supersedes
  // it. This intentionally replaces the previous response_due_at expiry check:
  // response_due_at is still stored/displayed, but no longer gates writes.
  const nudgesResult = await getTargetedNudges(supabase, participantId, participant?.cohort ?? null, mondayOfCurrentWeekIso())
  if ('error' in nudgesResult && nudgesResult.error) return NextResponse.json({ error: nudgesResult.error.message }, { status: 500 })
  const currentNudgeId = 'nudges' in nudgesResult ? (nudgesResult.nudges[0]?.id ?? null) : null
  if (currentNudgeId !== nudgeId) {
    return NextResponse.json({ error: 'This nudge is no longer current. Only the newest nudge accepts replies.' }, { status: 403 })
  }

  // Use RPC to upsert encrypted acknowledgement
  const { data, error } = await supabase
    .rpc('upsert_nudge_acknowledgement', {
      p_nudge_id: nudgeId,
      p_participant_id: participantId,
      p_response_text: responseText,
      p_encryption_key: getDbEncryptionKey(),
    })

  if (error) {
    const requestId = generateRequestId()
    // Raw Postgres/Supabase error details stay server-side only (see
    // buildStructuredAckError); correlate with the client via requestId.
    console.error('[participant/events PATCH] upsert_nudge_acknowledgement RPC error', {
      requestId,
      nudgeId,
      participantId,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    })
    return NextResponse.json(
      buildStructuredAckError('Unable to save nudge acknowledgement.', 500, error.code, requestId),
      { status: 500 },
    )
  }
  if (data?.error) {
    const requestId = asString(data.requestId) ?? generateRequestId()
    console.error('[participant/events PATCH] upsert_nudge_acknowledgement returned error payload', {
      requestId,
      nudgeId,
      participantId,
      data,
    })
    const payload = buildStructuredAckError('Unable to save nudge acknowledgement.', 500, data.code, requestId)
    return NextResponse.json(payload, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
