import { NextResponse } from 'next/server'
import { canActivateChallenge, evaluateEligibility, validateChallengePayload } from '@/lib/challenge-rules'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { requireChallengeOperator } from '@/lib/challenges/access'
import { isPilotChallengesBasicEnabled } from '@/lib/feature-flags'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

interface ActivateChallengeBody {
  version?: unknown
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!isPilotChallengesBasicEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const auth = await requireChallengeOperator()
  if ('error' in auth) return auth.error

  let body: ActivateChallengeBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const version = Number(body.version)
  if (!Number.isInteger(version) || version <= 0) {
    return NextResponse.json({ error: 'VERSION_CONFLICT', code: 'VERSION_CONFLICT' }, { status: 409 })
  }

  const supabase = createAdminSupabaseClient()
  const { data: challenge, error: challengeError } = await supabase
    .from('challenges')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  if (challengeError) return NextResponse.json({ error: challengeError.message }, { status: 500 })
  if (!challenge) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (challenge.version !== version) {
    return NextResponse.json({ error: 'VERSION_CONFLICT', code: 'VERSION_CONFLICT' }, { status: 409 })
  }
  if (!canActivateChallenge(challenge.status)) {
    return NextResponse.json({ error: 'Challenge is not in draft state' }, { status: 400 })
  }

  const validation = validateChallengePayload({
    name: challenge.name,
    description: challenge.description,
    metric_type: challenge.metric_type,
    threshold_value: challenge.threshold_value,
    window_start_at: challenge.window_start_at,
    window_end_at: challenge.window_end_at,
    eligibility_mode: challenge.eligibility_mode,
    eligibility_definition: challenge.eligibility_definition,
  })

  if (!validation.ok) {
    return NextResponse.json({ error: validation.code, code: validation.code }, { status: 400 })
  }

  const { data: activeChallenge } = await supabase
    .from('challenges')
    .select('id')
    .eq('status', 'active')
    .neq('id', params.id)
    .maybeSingle()

  if (activeChallenge) {
    return NextResponse.json({ error: 'CHALLENGE_ACTIVE_EXISTS', code: 'CHALLENGE_ACTIVE_EXISTS' }, { status: 409 })
  }

  const now = new Date().toISOString()
  const { data: activated, error: activationError } = await supabase
    .from('challenges')
    .update({
      status: 'active',
      activation_at: now,
      updated_by: auth.userId,
      updated_at: now,
      version: version + 1,
    })
    .eq('id', params.id)
    .eq('version', version)
    .select('*')
    .maybeSingle()

  if (activationError) return NextResponse.json({ error: activationError.message }, { status: 500 })
  if (!activated) {
    return NextResponse.json({ error: 'VERSION_CONFLICT', code: 'VERSION_CONFLICT' }, { status: 409 })
  }

  const { data: participants, error: participantsError } = await supabase
    .from('participants')
    .select('id, department, location_id, employment_type, enrolled_date')
    .eq('status', 'Active')

  if (participantsError) return NextResponse.json({ error: participantsError.message }, { status: 500 })

  const participantRows = (participants ?? []).map((participant) => {
    const eligibility = evaluateEligibility(
      {
        department: participant.department,
        location_id: participant.location_id,
        employment_type: participant.employment_type,
        enrolled_date: participant.enrolled_date,
      },
      activated.eligibility_mode,
      activated.eligibility_definition,
      new Date(now),
    )

    return {
      challenge_id: activated.id,
      participant_id: participant.id,
      is_eligible: eligibility.isEligible,
      eligibility_reason: eligibility.reason,
      progress_value: 0,
      completed: false,
      created_at: now,
      updated_at: now,
    }
  })

  if (participantRows.length) {
    const { error: participantError } = await supabase
      .from('challenge_participants')
      .upsert(participantRows, { onConflict: 'challenge_id,participant_id' })

    if (participantError) return NextResponse.json({ error: participantError.message }, { status: 500 })
  }

  await supabase
    .from('challenge_audit_log')
    .insert({
      challenge_id: activated.id,
      actor_id: auth.userId,
      action: 'activate',
      before: challenge,
      after: activated,
      context: { source: 'api.admin.challenges.activate', participant_seed_count: participantRows.length },
    })

  logger.info({
    event: 'challenge_activated',
    challenge_id: activated.id,
    actor_id: auth.userId,
    participant_seed_count: participantRows.length,
  })

  return NextResponse.json(activated)
}
