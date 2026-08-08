import { NextResponse } from 'next/server'
import { getSession, getUserAccess } from '@/lib/supabase/server'
import { getParticipantRankContext } from '@/lib/supabase/queries'
import type { LeaderboardMetric } from '@/types'

export const runtime = 'nodejs'

const METRICS = new Set<LeaderboardMetric>(['recovery', 'workouts_logged', 'points_earned', 'consistency_streak'])

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await getUserAccess(session.user.id)
  if (access.role !== 'participant') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const metric = url.searchParams.get('metric') as LeaderboardMetric | null
  if (!metric || !METRICS.has(metric)) {
    return NextResponse.json({ error: 'Invalid metric.' }, { status: 400 })
  }

  try {
    const context = await getParticipantRankContext(session.user.id, metric)
    return NextResponse.json({ context })
  } catch (error) {
    const status = typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status: number }).status)
      : 500
    const message = status === 404
      ? (error as Error).message
      : 'Failed to load participant ranking context.'
    return NextResponse.json({ error: message }, { status })
  }
}
