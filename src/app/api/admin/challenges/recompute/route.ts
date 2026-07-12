import { NextResponse } from 'next/server'
import { recomputeActiveChallengeProgress } from '@/lib/challenges/progress'
import { isPilotChallengesBasicEnabled } from '@/lib/feature-flags'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { requireChallengeOperator } from '@/lib/challenges/access'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

export async function POST() {
  if (!isPilotChallengesBasicEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const auth = await requireChallengeOperator()
  if ('error' in auth) return auth.error

  const supabase = createAdminSupabaseClient()
  const result = await recomputeActiveChallengeProgress(supabase, { source: 'scheduled_recompute' })
  if (!result) {
    logger.info({ event: 'challenge_recompute_no_active', actor_id: auth.userId })
    return NextResponse.json({ active_challenge: null, updated_participants: 0 })
  }

  logger.info({
    event: 'challenge_recompute_triggered',
    actor_id: auth.userId,
    challenge_id: result.challengeId,
    updated_participants: result.updatedParticipants,
    finalized: result.finalized,
  })

  return NextResponse.json({
    active_challenge: result.challengeId,
    updated_participants: result.updatedParticipants,
    finalized: result.finalized,
  })
}
