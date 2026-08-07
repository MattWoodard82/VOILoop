import { NextResponse } from 'next/server'
import { getSession } from '@/lib/supabase/server'
import { getParticipantRankContext } from '@/lib/supabase/queries'
import type { LeaderboardMetric } from '@/types'

export const runtime = 'nodejs'

const METRICS = new Set<LeaderboardMetric>(['recovery', 'workouts_logged', 'points_earned', 'consistency_streak'])

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const metric = url.searchParams.get('metric') as LeaderboardMetric | null
  if (!metric || !METRICS.has(metric)) {
    return NextResponse.json({ error: 'Invalid metric.' }, { status: 400 })
  }

  const context = await getParticipantRankContext(session.user.id, metric)
  return NextResponse.json({ context })
}
