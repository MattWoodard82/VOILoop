import { NextResponse } from 'next/server'
import { canEditFieldWhileActive, isTerminalChallengeStatus, normalizeEligibilityDefinition, validateChallengePayload } from '@/lib/challenge-rules'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { requireChallengeOperator } from '@/lib/challenges/access'
import { isPilotChallengesBasicEnabled } from '@/lib/feature-flags'

export const runtime = 'nodejs'

interface UpdateChallengeBody {
  version?: unknown
  name?: unknown
  description?: unknown
  metric_type?: unknown
  threshold_value?: unknown
  window_start_at?: unknown
  window_end_at?: unknown
  eligibility_mode?: unknown
  eligibility_definition?: unknown
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!isPilotChallengesBasicEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const auth = await requireChallengeOperator()
  if ('error' in auth) return auth.error

  let body: UpdateChallengeBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const version = Number(body.version)
  if (!Number.isInteger(version) || version <= 0) {
    return NextResponse.json({ error: 'VERSION_CONFLICT', code: 'VERSION_CONFLICT' }, { status: 409 })
  }

  const updatePayload: Record<string, unknown> = {}
  if (body.name !== undefined) updatePayload.name = String(body.name ?? '').trim()
  if (body.description !== undefined) updatePayload.description = body.description == null ? null : String(body.description)
  if (body.metric_type !== undefined) updatePayload.metric_type = String(body.metric_type)
  if (body.threshold_value !== undefined) updatePayload.threshold_value = Number(body.threshold_value)
  if (body.window_start_at !== undefined) updatePayload.window_start_at = String(body.window_start_at)
  if (body.window_end_at !== undefined) updatePayload.window_end_at = String(body.window_end_at)
  if (body.eligibility_mode !== undefined) updatePayload.eligibility_mode = String(body.eligibility_mode)
  if (body.eligibility_definition !== undefined) {
    const mode = (updatePayload.eligibility_mode as 'all_employees' | 'filtered' | undefined) ?? 'filtered'
    updatePayload.eligibility_definition = normalizeEligibilityDefinition(mode, body.eligibility_definition)
  }

  if (!Object.keys(updatePayload).length) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()
  const { data: challenge, error: loadError } = await supabase
    .from('challenges')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 })
  if (!challenge) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (challenge.version !== version) {
    return NextResponse.json({ error: 'VERSION_CONFLICT', code: 'VERSION_CONFLICT' }, { status: 409 })
  }

  if (isTerminalChallengeStatus(challenge.status)) {
    return NextResponse.json({ error: 'Challenge is immutable in terminal state' }, { status: 400 })
  }

  if (challenge.status === 'active') {
    const blockedField = Object.keys(updatePayload).find((field) => !canEditFieldWhileActive(field as never))
    if (blockedField) {
      return NextResponse.json(
        { error: `Field "${blockedField}" cannot be edited while active` },
        { status: 400 },
      )
    }
  }

  const merged = { ...challenge, ...updatePayload }
  const validation = validateChallengePayload({
    name: merged.name,
    description: merged.description,
    metric_type: merged.metric_type,
    threshold_value: merged.threshold_value,
    window_start_at: merged.window_start_at,
    window_end_at: merged.window_end_at,
    eligibility_mode: merged.eligibility_mode,
    eligibility_definition: merged.eligibility_definition,
  })

  if (!validation.ok) {
    return NextResponse.json({ error: validation.code, code: validation.code }, { status: 400 })
  }

  if (merged.eligibility_mode === 'filtered' && !merged.eligibility_definition) {
    return NextResponse.json({ error: 'INVALID_ELIGIBILITY', code: 'INVALID_ELIGIBILITY' }, { status: 400 })
  }

  const { data: updated, error: updateError } = await supabase
    .from('challenges')
    .update({
      ...updatePayload,
      version: version + 1,
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .eq('version', version)
    .select('*')
    .maybeSingle()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  if (!updated) {
    return NextResponse.json({ error: 'VERSION_CONFLICT', code: 'VERSION_CONFLICT' }, { status: 409 })
  }

  await supabase
    .from('challenge_audit_log')
    .insert({
      challenge_id: updated.id,
      actor_id: auth.userId,
      action: 'update',
      before: challenge,
      after: updated,
      context: { source: 'api.admin.challenges.update' },
    })

  return NextResponse.json(updated)
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!isPilotChallengesBasicEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const auth = await requireChallengeOperator()
  if ('error' in auth) return auth.error

  const supabase = createAdminSupabaseClient()
  const { data: challenge, error: challengeError } = await supabase
    .from('challenges')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  if (challengeError) return NextResponse.json({ error: challengeError.message }, { status: 500 })
  if (!challenge) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: participants, error: participantsError } = await supabase
    .from('challenge_participants')
    .select('is_eligible, completed')
    .eq('challenge_id', params.id)

  if (participantsError) return NextResponse.json({ error: participantsError.message }, { status: 500 })

  const rows = participants ?? []
  const summary = {
    total_participants: rows.length,
    eligible_count: rows.filter((row) => row.is_eligible).length,
    completed_count: rows.filter((row) => row.completed).length,
  }

  return NextResponse.json({
    challenge,
    summary,
  })
}
