import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { requireChallengeOperator } from '@/lib/challenges/access'
import { isPilotChallengesBasicEnabled } from '@/lib/feature-flags'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: { id: string } }) {
  if (!isPilotChallengesBasicEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const auth = await requireChallengeOperator()
  if ('error' in auth) return auth.error

  const url = new URL(request.url)
  const status = (url.searchParams.get('status') ?? '').trim()
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? '50')))
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0'))

  const supabase = createAdminSupabaseClient()
  let query = supabase
    .from('challenge_participants')
    .select('*')
    .eq('challenge_id', params.id)
    .order('employee_id', { ascending: true })
    .range(offset, offset + limit - 1)

  if (status === 'completed') query = query.eq('completed', true)
  if (status === 'incomplete') query = query.eq('completed', false)
  if (status === 'eligible') query = query.eq('is_eligible', true)
  if (status === 'ineligible') query = query.eq('is_eligible', false)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    challenge_id: params.id,
    status_filter: status || null,
    offset,
    limit,
    participants: data ?? [],
  })
}
