import { NextResponse } from 'next/server'
import { getSession, getUserAccess } from '@/lib/supabase/server'
import { getNudgeHistoryForParticipant } from '@/lib/supabase/queries'

export const runtime = 'nodejs'

// Backs the WD dashboard's "Recent nudges & responses" card (per-participant
// history of individually-targeted nudges + whether the participant responded).
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await getUserAccess(session.user.id)
  if (access.role !== 'admin' && access.role !== 'wellness_director') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const participantId = searchParams.get('participantId')
  if (!participantId) {
    return NextResponse.json({ error: 'participantId is required' }, { status: 400 })
  }

  try {
    const history = await getNudgeHistoryForParticipant(participantId)
    return NextResponse.json({ history })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load nudge history'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
