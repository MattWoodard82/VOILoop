import { NextResponse } from 'next/server'
import { createServerSupabaseClient, requireAdmin } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const DEFAULT_WEIGHTS = {
  login_frequency_weight: 25,
  pulse_survey_completion_weight: 20,
  data_submission_weight: 25,
  intervention_follow_up_weight: 15,
  trend_consistency_weight: 15,
}

type WeightName = keyof typeof DEFAULT_WEIGHTS
type WeightRecord = Record<WeightName, number>

function isMissingWeightsTable(error: { code?: string | null; message?: string | null } | null) {
  if (!error) return false
  const message = (error.message ?? '').toLowerCase()
  return error.code === 'PGRST205' || message.includes('engagement_score_weights')
}

function normalizeWeights(rows: Array<{ weight_name: string; weight_value: number | string | null }> | null | undefined): WeightRecord {
  const weights: WeightRecord = { ...DEFAULT_WEIGHTS }
  for (const row of rows ?? []) {
    if (!(row.weight_name in DEFAULT_WEIGHTS)) continue
    const value = Number(row.weight_value)
    if (Number.isFinite(value)) {
      weights[row.weight_name as WeightName] = value
    }
  }
  return weights
}

export async function GET() {
  const admin = await requireAdmin()
  if ('redirect' in admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('engagement_score_weights')
    .select('weight_name, weight_value')
    .is('organization_id', null)

  if (error && !isMissingWeightsTable(error)) return NextResponse.json({ error: error.message }, { status: 500 })
  if (error && isMissingWeightsTable(error)) {
    return NextResponse.json({ config: { scope: 'global', weights: DEFAULT_WEIGHTS } })
  }

  return NextResponse.json({
    config: {
      scope: 'global',
      weights: normalizeWeights(data),
    },
  })
}

export async function PUT(request: Request) {
  const admin = await requireAdmin()
  if ('redirect' in admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const weights = body?.weights
  const login_frequency_weight = Number(weights?.login_frequency_weight)
  const pulse_survey_completion_weight = Number(weights?.pulse_survey_completion_weight)
  const data_submission_weight = Number(weights?.data_submission_weight)
  const intervention_follow_up_weight = Number(weights?.intervention_follow_up_weight)
  const trend_consistency_weight = Number(weights?.trend_consistency_weight)

  const nextWeights: WeightRecord = {
    login_frequency_weight,
    pulse_survey_completion_weight,
    data_submission_weight,
    intervention_follow_up_weight,
    trend_consistency_weight,
  }

  if (!Object.values(nextWeights).every((value) => Number.isFinite(value) && value >= 0 && value <= 100)) {
    return NextResponse.json({ error: 'Invalid weights' }, { status: 400 })
  }

  const total = Object.values(nextWeights).reduce((sum, value) => sum + value, 0)
  if (total !== 100) {
    return NextResponse.json({ error: 'Weights must sum to 100' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const upsertRows = (Object.entries(nextWeights) as Array<[WeightName, number]>).map(([weight_name, weight_value]) => ({
    organization_id: null,
    weight_name,
    weight_value,
    created_by: admin.session.user.id,
  }))
  const { error } = await supabase
    .from('engagement_score_weights')
    .upsert(upsertRows, { onConflict: 'organization_id,weight_name' })

  if (error && isMissingWeightsTable(error)) {
    return NextResponse.json({ error: 'Engagement score weight storage is not provisioned yet.' }, { status: 503 })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ config: { scope: 'global', weights: nextWeights } })
}
