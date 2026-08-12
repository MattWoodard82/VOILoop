import { NextResponse } from 'next/server'
import { createServerSupabaseClient, getRoleAndSession } from '@/lib/supabase/server'

export const runtime = 'nodejs'

function buildRulesCopy() {
  return {
    accrual_text: 'Points accrue daily from eligible wellness activities. During pilot rollout phases, the operator team manages point balances and recomputes them from the source of truth.',
    cap_text: 'Weekly point caps are enforced by the active rewards policy. Check with your operator for the current weekly cap and bonus tiers for this pilot rollout.',
    bonus_text: 'Bonus points are awarded only after the associated activity is confirmed or explicitly approved by an operator. Redemption requires admin verification in the PTO request flow.',
    updated_at: new Date().toISOString(),
  }
}

export async function GET() {
  const { session, role } = await getRoleAndSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (role !== 'participant') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createServerSupabaseClient()
  const { data: participantRecord, error: participantError } = await supabase
    .from('participants')
    .select('id, auth_user_id')
    .eq('auth_user_id', session.user.id)
    .maybeSingle()

  if (participantError) return NextResponse.json({ error: participantError.message }, { status: 500 })
  if (!participantRecord) {
    return NextResponse.json({ visibility_state: 'none', rewards: null, rules: null })
  }

  const { data: activeChallenge, error: challengeError } = await supabase
    .from('challenges')
    .select('id, name, status, threshold_value, window_start_at, window_end_at, updated_at')
    .eq('status', 'active')
    .maybeSingle()

  if (challengeError) return NextResponse.json({ error: challengeError.message }, { status: 500 })

  const { data: challengeParticipant, error: participantChallengeError } = activeChallenge
    ? await supabase
      .from('challenge_participants')
      .select('is_eligible, eligibility_reason, progress_value, completed, completed_at, updated_at')
      .eq('challenge_id', activeChallenge.id)
      .eq('participant_id', participantRecord.id)
      .maybeSingle()
    : { data: null, error: null }

  if (participantChallengeError) return NextResponse.json({ error: participantChallengeError.message }, { status: 500 })

  if (!activeChallenge) {
    return NextResponse.json({
      visibility_state: 'none',
      rewards: null,
      rules: buildRulesCopy(),
    })
  }

  return NextResponse.json({
    visibility_state: challengeParticipant?.is_eligible ? 'eligible' : 'ineligible',
    rewards: {
      challenge: activeChallenge,
      participant: challengeParticipant ?? null,
      redemption_state: challengeParticipant?.completed
        ? 'approved'
        : challengeParticipant?.progress_value
          ? 'submitted'
          : 'available',
    },
    rules: buildRulesCopy(),
  })
}
