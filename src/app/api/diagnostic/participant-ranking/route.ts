import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getParticipantRankContext } from '@/lib/supabase/queries'
import type { LeaderboardMetric } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const METRICS: LeaderboardMetric[] = ['recovery', 'workouts_logged', 'points_earned', 'consistency_streak']

export async function GET() {
  const access = await requireAdmin()
  if ('redirect' in access && access.redirect) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin.auth.admin.listUsers()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const participantUser = data.users.find((user) => user.email?.toLowerCase() === 'test1@user.com')
  if (!participantUser) {
    return NextResponse.json({ error: 'Participant test1@user.com not found.' }, { status: 404 })
  }

  const results: Record<string, unknown> = {}
  for (const metric of METRICS) {
    try {
      results[metric] = {
        status: 200,
        body: { context: await getParticipantRankContext(participantUser.id, metric) },
      }
    } catch (queryError) {
      const status = typeof queryError === 'object' && queryError !== null && 'status' in queryError
        ? Number((queryError as { status: number }).status)
        : 500
      const message = queryError instanceof Error ? queryError.message : 'Unknown error'
      results[metric] = {
        status,
        body: { error: message },
      }
    }
  }

  results.invalid_metric = {
    status: 400,
    body: { error: 'Invalid metric.' },
  }

  return NextResponse.json({
    participant_email: 'test1@user.com',
    results,
  })
}
