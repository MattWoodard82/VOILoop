import { NextResponse } from 'next/server'
import { recomputeActiveChallengeProgress } from '@/lib/challenges/progress'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { isPilotChallengesBasicEnabled } from '@/lib/feature-flags'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

// GET /api/cron/challenge-recompute
//
// Scheduled reconciliation endpoint for challenge progress.
// Should be called every 15 minutes by a cron scheduler (e.g. Vercel Cron).
//
// Secured by Authorization: Bearer <CRON_SECRET> header.
// Set CRON_SECRET in the deployment environment to a strong random string.
//
// Example Vercel cron config in vercel.json:
//   { "crons": [{ "path": "/api/cron/challenge-recompute", "schedule": "0,15,30,45 * * * *" }] }
//
// Vercel passes CRON_SECRET automatically; for other schedulers add the header manually.
export async function GET(request: Request) {
  if (!isPilotChallengesBasicEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (bearerToken !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } else {
    logger.warn({ event: 'challenge_cron_recompute_no_secret', message: 'CRON_SECRET is not set; cron endpoint is unauthenticated' })
  }

  const supabase = createAdminSupabaseClient()

  let result: Awaited<ReturnType<typeof recomputeActiveChallengeProgress>>
  try {
    result = await recomputeActiveChallengeProgress(supabase, { source: 'scheduled_recompute' })
  } catch (err) {
    logger.error({
      event: 'challenge_cron_recompute_failed',
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Recompute failed' }, { status: 500 })
  }

  if (!result) {
    logger.info({ event: 'challenge_cron_recompute_no_active' })
    return NextResponse.json({ active_challenge: null, updated_participants: 0 })
  }

  logger.info({
    event: 'challenge_cron_recompute_completed',
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
