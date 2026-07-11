import { NextResponse } from 'next/server'
import { canCancelChallenge } from '@/lib/challenge-rules'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { requireChallengeOperator } from '@/lib/challenges/access'
import { isPilotChallengesBasicEnabled } from '@/lib/feature-flags'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

interface CancelChallengeBody {
  version?: unknown
  reason?: unknown
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!isPilotChallengesBasicEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const auth = await requireChallengeOperator()
  if ('error' in auth) return auth.error

  let body: CancelChallengeBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const version = Number(body.version)
  if (!Number.isInteger(version) || version <= 0) {
    return NextResponse.json({ error: 'VERSION_CONFLICT', code: 'VERSION_CONFLICT' }, { status: 409 })
  }

  const reason = body.reason == null ? null : String(body.reason).trim()

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
  if (!canCancelChallenge(challenge.status)) {
    return NextResponse.json({ error: 'Challenge cannot be cancelled in current status' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { data: cancelled, error: cancelError } = await supabase
    .from('challenges')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      updated_by: auth.userId,
      updated_at: now,
      version: version + 1,
    })
    .eq('id', params.id)
    .eq('version', version)
    .select('*')
    .maybeSingle()

  if (cancelError) return NextResponse.json({ error: cancelError.message }, { status: 500 })
  if (!cancelled) {
    return NextResponse.json({ error: 'VERSION_CONFLICT', code: 'VERSION_CONFLICT' }, { status: 409 })
  }

  await supabase
    .from('challenge_audit_log')
    .insert({
      challenge_id: cancelled.id,
      actor_id: auth.userId,
      action: 'cancel',
      before: challenge,
      after: cancelled,
      context: { source: 'api.admin.challenges.cancel', reason },
    })

  logger.info({
    event: 'challenge_cancelled',
    challenge_id: cancelled.id,
    actor_id: auth.userId,
    reason,
  })

  return NextResponse.json(cancelled)
}
