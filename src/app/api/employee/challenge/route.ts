import { NextResponse } from 'next/server'
import { createServerSupabaseClient, getSession, getUserAccess } from '@/lib/supabase/server'
import { isPilotChallengesBasicEnabled } from '@/lib/feature-flags'

export const runtime = 'nodejs'

/**
 * GET /api/employee/challenge
 *
 * Returns the employee-facing active challenge state for the authenticated participant.
 * Requires the caller to have the `participant` role.
 *
 * Response shape:
 *   { visibility_state: 'none' }
 *   { visibility_state: 'ineligible', id, name, status, version, threshold_value,
 *     eligibility_mode, window_start_at, window_end_at }
 *   { visibility_state: 'eligible', id, name, status, version, threshold_value,
 *     eligibility_mode, window_start_at, window_end_at,
 *     progress_value, completed, completed_at, last_computed_at }
 */
export async function GET() {
  if (!isPilotChallengesBasicEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await getUserAccess(session.user.id)
  if (access.role !== 'participant') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createServerSupabaseClient()

  // Resolve the participant record for the authenticated user
  const { data: participant, error: participantError } = await supabase
    .from('participants')
    .select('id')
    .eq('auth_user_id', session.user.id)
    .maybeSingle()

  if (participantError) {
    return NextResponse.json({ error: participantError.message }, { status: 500 })
  }

  if (!participant) {
    return NextResponse.json({ visibility_state: 'none' })
  }

  // Prefer the active challenge; fall back to most recent terminal challenge for frozen-state visibility
  const { data: activeChallenge, error: challengeError } = await supabase
    .from('challenges')
    .select('id, name, status, version, threshold_value, eligibility_mode, window_start_at, window_end_at')
    .eq('status', 'active')
    .maybeSingle()

  if (challengeError) {
    return NextResponse.json({ error: challengeError.message }, { status: 500 })
  }

  let visibleChallenge = activeChallenge
  if (!visibleChallenge) {
    const { data: terminalChallenge, error: terminalError } = await supabase
      .from('challenges')
      .select('id, name, status, version, threshold_value, eligibility_mode, window_start_at, window_end_at')
      .in('status', ['cancelled', 'completed'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (terminalError) {
      return NextResponse.json({ error: terminalError.message }, { status: 500 })
    }
    visibleChallenge = terminalChallenge
  }

  if (!visibleChallenge) {
    return NextResponse.json({ visibility_state: 'none' })
  }

  // Look up this participant's record for the challenge
  const { data: challengeParticipant, error: cpError } = await supabase
    .from('challenge_participants')
    .select('is_eligible, progress_value, completed, completed_at, updated_at')
    .eq('challenge_id', visibleChallenge.id)
    .eq('participant_id', participant.id)
    .maybeSingle()

  if (cpError) {
    return NextResponse.json({ error: cpError.message }, { status: 500 })
  }

  const base = {
    id: visibleChallenge.id,
    name: visibleChallenge.name,
    status: visibleChallenge.status,
    version: visibleChallenge.version,
    threshold_value: visibleChallenge.threshold_value,
    eligibility_mode: visibleChallenge.eligibility_mode,
    window_start_at: visibleChallenge.window_start_at,
    window_end_at: visibleChallenge.window_end_at,
  }

  if (!challengeParticipant || !challengeParticipant.is_eligible) {
    return NextResponse.json({ visibility_state: 'ineligible', ...base })
  }

  return NextResponse.json({
    visibility_state: 'eligible',
    ...base,
    progress_value: challengeParticipant.progress_value ?? 0,
    completed: Boolean(challengeParticipant.completed),
    completed_at: challengeParticipant.completed_at ?? null,
    last_computed_at: challengeParticipant.updated_at ?? null,
  })
}
