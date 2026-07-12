import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { requireChallengeOperator } from '@/lib/challenges/access'
import { normalizeEligibilityDefinition, validateChallengePayload } from '@/lib/challenge-rules'
import { isPilotChallengesBasicEnabled } from '@/lib/feature-flags'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

interface CreateChallengeBody {
  name?: unknown
  description?: unknown
  metric_type?: unknown
  threshold_value?: unknown
  window_start_at?: unknown
  window_end_at?: unknown
  eligibility_mode?: unknown
  eligibility_definition?: unknown
}

export async function POST(request: Request) {
  if (!isPilotChallengesBasicEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const auth = await requireChallengeOperator()
  if ('error' in auth) return auth.error

  let body: CreateChallengeBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const payload = {
    name: String(body.name ?? '').trim(),
    description: body.description == null ? null : String(body.description),
    metric_type: String(body.metric_type ?? ''),
    threshold_value: Number(body.threshold_value),
    window_start_at: String(body.window_start_at ?? ''),
    window_end_at: String(body.window_end_at ?? ''),
    eligibility_mode: String(body.eligibility_mode ?? ''),
    eligibility_definition: normalizeEligibilityDefinition(
      String(body.eligibility_mode ?? '') as 'all_employees' | 'filtered',
      body.eligibility_definition,
    ),
  }

  const validation = validateChallengePayload(payload)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.code, code: validation.code }, { status: 400 })
  }

  if (payload.eligibility_mode === 'filtered' && !payload.eligibility_definition) {
    return NextResponse.json({ error: 'INVALID_ELIGIBILITY', code: 'INVALID_ELIGIBILITY' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('challenges')
    .insert({
      name: payload.name,
      description: payload.description,
      metric_type: payload.metric_type,
      threshold_value: payload.threshold_value,
      window_start_at: payload.window_start_at,
      window_end_at: payload.window_end_at,
      eligibility_mode: payload.eligibility_mode,
      eligibility_definition: payload.eligibility_definition,
      status: 'draft',
      created_by: auth.userId,
      updated_by: auth.userId,
      version: 1,
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase
    .from('challenge_audit_log')
    .insert({
      challenge_id: data.id,
      actor_id: auth.userId,
      action: 'create',
      before: null,
      after: data,
      context: { source: 'api.admin.challenges.create' },
    })

  logger.info({
    event: 'challenge_created',
    challenge_id: data.id,
    actor_id: auth.userId,
    status: data.status,
  })

  return NextResponse.json(data, { status: 201 })
}

export async function GET(request: Request) {
  if (!isPilotChallengesBasicEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const auth = await requireChallengeOperator()
  if ('error' in auth) return auth.error

  const url = new URL(request.url)
  const status = (url.searchParams.get('status') ?? '').trim()
  const allowedStatuses = new Set(['draft', 'active', 'completed', 'cancelled'])
  if (status && !allowedStatuses.has(status)) {
    return NextResponse.json({ error: 'INVALID_STATUS', code: 'INVALID_STATUS' }, { status: 400 })
  }
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? '50')))
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0'))

  const supabase = createAdminSupabaseClient()
  let query = supabase
    .from('challenges')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  logger.info({
    event: 'challenge_list_loaded',
    actor_id: auth.userId,
    status_filter: status || null,
    count: (data ?? []).length,
  })

  return NextResponse.json({
    offset,
    limit,
    status_filter: status || null,
    challenges: data ?? [],
  })
}
