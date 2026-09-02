import { NextResponse } from 'next/server'
import { getSession, getUserAccess } from '@/lib/supabase/server'
import { getParticipants, getWeeklyResponseRate } from '@/lib/supabase/queries'
import { isValidCalendarDateString } from '@/lib/date-validation'

export const runtime = 'nodejs'

// Backs the WD dashboard's "Weekly response rate" card: for every active
// participant, which of the requested week's 7 days (Mon-Sun) had a submitted
// CSV/WHOOP entry, plus the resulting week completion percentage.
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await getUserAccess(session.user.id)
  if (access.role !== 'admin' && access.role !== 'wellness_director') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const weekStart = searchParams.get('weekStart')
  if (!isValidCalendarDateString(weekStart)) {
    return NextResponse.json({ error: 'weekStart must be a valid YYYY-MM-DD date' }, { status: 400 })
  }

  try {
    const participants = await getParticipants()
    const rows = await getWeeklyResponseRate(weekStart, participants.map((participant) => participant.id))
    return NextResponse.json({ rows })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load weekly response rate'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
