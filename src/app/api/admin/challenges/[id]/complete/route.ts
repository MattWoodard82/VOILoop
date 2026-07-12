import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { requireChallengeOperator } from '@/lib/challenges/access'
import { isPilotChallengesBasicEnabled } from '@/lib/feature-flags'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

interface CompleteChallengeBody {
  version?: unknown
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!isPilotChallengesBasicEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const auth = await requireChallengeOperator()
  if ('error' in auth) return auth.error

  let body: CompleteChallengeBody
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
  if (challenge.status !== 'active') {
    return NextResponse.json({ error: 'Only active challenges can be completed' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { data: completed, error: completeError } = await supabase
    .from('challenges')
    .update({
      status: 'completed',
      completed_at: now,
      updated_by: auth.userId,
      updated_at: now,
      version: version + 1,
    })
    .eq('id', params.id)
    .eq('version', version)
    .eq('status', 'active')
    .select('*')
    .maybeSingle()

  if (completeError) return NextResponse.json({ error: completeError.message }, { status: 500 })
  if (!completed) return NextResponse.json({ error: 'VERSION_CONFLICT', code: 'VERSION_CONFLICT' }, { status: 409 })

  await supabase
    .from('challenge_audit_log')
    .insert({
      challenge_id: completed.id,
      actor_id: auth.userId,
      action: 'complete',
      before: challenge,
      after: completed,
      context: { source: 'api.admin.challenges.complete' },
    })

  logger.info({
    event: 'challenge_completed',
    challenge_id: completed.id,
    actor_id: auth.userId,
  })

  return NextResponse.json(completed)
}
