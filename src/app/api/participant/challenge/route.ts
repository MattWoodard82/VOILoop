import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getSession, getUserAccess } from '@/lib/supabase/server'
import { isPilotChallengesBasicEnabled } from '@/lib/feature-flags'

export const runtime = 'nodejs'

export async function GET() {
  if (!isPilotChallengesBasicEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await getUserAccess(session.user.id)
  if (access.role !== 'participant') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createAdminSupabaseClient()

  const { data: participantRecord, error: participantError } = await supabase
    .from('participants')
    .select('id')
    .eq('auth_user_id', session.user.id)
    .maybeSingle()

  if (participantError) return NextResponse.json({ error: participantError.message }, { status: 500 })
  if (!participantRecord) {
    return NextResponse.json({
      visibility_state: 'none',
      challenge: null,
    })
  }

  const { data: challenge, error: challengeError } = await supabase
    .from('challenges')
    .select('id, name, description, status, threshold_value, window_start_at, window_end_at, eligibility_mode, updated_at')
    .eq('status', 'active')
    .maybeSingle()

  if (challengeError) return NextResponse.json({ error: challengeError.message }, { status: 500 })
  let resolvedChallenge = challenge
  if (!resolvedChallenge) {
    const { data: terminalChallenge, error: terminalChallengeError } = await supabase
      .from('challenges')
      .select('id, name, description, status, threshold_value, window_start_at, window_end_at, eligibility_mode, updated_at')
      .in('status', ['cancelled', 'completed'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (terminalChallengeError) return NextResponse.json({ error: terminalChallengeError.message }, { status: 500 })
    resolvedChallenge = terminalChallenge
  }
  if (!resolvedChallenge) {
    return NextResponse.json({ visibility_state: 'none', challenge: null })
  }

  const { data: challengeParticipant, error: challengeParticipantError } = await supabase
    .from('challenge_participants')
    .select('is_eligible, eligibility_reason, progress_value, completed, completed_at, updated_at')
    .eq('challenge_id', resolvedChallenge.id)
    .eq('participant_id', participantRecord.id)
    .maybeSingle()

  if (challengeParticipantError) return NextResponse.json({ error: challengeParticipantError.message }, { status: 500 })

  if (!challengeParticipant || !challengeParticipant.is_eligible) {
    return NextResponse.json({
      visibility_state: 'ineligible',
      challenge: {
        ...resolvedChallenge,
        progress_value: 0,
        completed: false,
        completed_at: null,
        last_computed_at: challengeParticipant?.updated_at ?? resolvedChallenge.updated_at,
        eligibility_reason: challengeParticipant?.eligibility_reason ?? 'not_seeded',
      },
    })
  }

  return NextResponse.json({
    visibility_state: 'eligible',
    challenge: {
      ...resolvedChallenge,
      progress_value: challengeParticipant.progress_value,
      completed: challengeParticipant.completed,
      completed_at: challengeParticipant.completed_at,
      last_computed_at: challengeParticipant.updated_at,
    },
  })
}
