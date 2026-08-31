import { NextResponse } from 'next/server'
import { createServerSupabaseClient, requireAdmin, getSession, getUserAccess } from '@/lib/supabase/server'
import { normalizeTeamHealthScoreConfig } from '@/lib/team-health-score-config'

export const runtime = 'nodejs'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MIN_BASELINE_DAYS = 7

function daysInclusive(start: string, end: string): number {
  const startMs = new Date(`${start}T00:00:00.000Z`).getTime()
  const endMs = new Date(`${end}T00:00:00.000Z`).getTime()
  return Math.round((endMs - startMs) / 86_400_000) + 1
}

export async function GET() {
  // Wellness Directors need to read this to display the (read-only) baseline window on
  // their dashboard; admins can also read it before editing.
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await getUserAccess(session.user.id)
  if (access.role !== 'admin' && access.role !== 'wellness_director') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('team_health_score_config')
    .select('*')
    .eq('id', 'current')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ config: { id: 'current', ...normalizeTeamHealthScoreConfig(data) } })
}

export async function PUT(request: Request) {
  const admin = await requireAdmin()
  if ('redirect' in admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const baselineStart = body?.baseline_start
  const baselineEnd = body?.baseline_end

  if (typeof baselineStart !== 'string' || typeof baselineEnd !== 'string' ||
      !DATE_RE.test(baselineStart) || !DATE_RE.test(baselineEnd)) {
    return NextResponse.json({ error: 'Invalid baseline window' }, { status: 400 })
  }
  if (baselineStart > baselineEnd) {
    return NextResponse.json({ error: 'baseline_start must be on or before baseline_end' }, { status: 400 })
  }
  if (daysInclusive(baselineStart, baselineEnd) < MIN_BASELINE_DAYS) {
    return NextResponse.json({ error: `Baseline window must be at least ${MIN_BASELINE_DAYS} days` }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('team_health_score_config')
    .upsert({
      id: 'current',
      baseline_start: baselineStart,
      baseline_end: baselineEnd,
    }, { onConflict: 'id' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ config: data })
}
