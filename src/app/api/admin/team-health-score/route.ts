import { NextResponse } from 'next/server'
import { getSession, getUserAccess } from '@/lib/supabase/server'
import { getTeamHealthScore } from '@/lib/supabase/queries'

export const runtime = 'nodejs'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await getUserAccess(session.user.id)
  if (access.role !== 'admin' && access.role !== 'wellness_director') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const participantId = searchParams.get('participantId')
  const currentStart = searchParams.get('currentStart')

  if (!participantId) {
    return NextResponse.json({ error: 'participantId is required' }, { status: 400 })
  }
  if (!currentStart || !DATE_RE.test(currentStart)) {
    return NextResponse.json({ error: 'currentStart must be a YYYY-MM-DD date' }, { status: 400 })
  }

  try {
    const score = await getTeamHealthScore(participantId, currentStart)
    return NextResponse.json({ score })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to compute Team Health Score'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
