import { NextResponse } from 'next/server'
import { createServerSupabaseClient, requireAdmin } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const DEFAULT_WEIGHTS = {
  submission_consistency: 25,
  device_wear_consistency: 20,
  pulse_completion: 20,
  nudge_response: 15,
  workout_volume: 20,
}

const FR13_WEIGHT_KEYS = [
  'submission_consistency',
  'device_wear_consistency',
  'pulse_completion',
  'nudge_response',
  'workout_volume',
] as const

// A persisted config row may still hold the legacy {recovery, hrv, sleep, debt}
// shape from before this route switched to the FR-13 component keys. Normalize
// anything that isn't a complete, well-formed FR-13 weights object back to the
// defaults instead of surfacing stale legacy keys to the client (which would then
// show wrong labels, fail diagnostics, and reject on PUT).
function normalizeWeights(rawWeights: unknown): typeof DEFAULT_WEIGHTS {
  if (!rawWeights || typeof rawWeights !== 'object') return DEFAULT_WEIGHTS
  const candidate = rawWeights as Record<string, unknown>
  const hasAllKeys = FR13_WEIGHT_KEYS.every((key) => typeof candidate[key] === 'number' && Number.isFinite(candidate[key]))
  if (!hasAllKeys) return DEFAULT_WEIGHTS
  return {
    submission_consistency: candidate.submission_consistency as number,
    device_wear_consistency: candidate.device_wear_consistency as number,
    pulse_completion: candidate.pulse_completion as number,
    nudge_response: candidate.nudge_response as number,
    workout_volume: candidate.workout_volume as number,
  }
}

export async function GET() {
  const admin = await requireAdmin()
  if ('redirect' in admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('wellness_director_config')
    .select('*')
    .eq('id', 'current')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ config: { id: 'current', weights: normalizeWeights(data?.weights) } })
}

export async function PUT(request: Request) {
  const admin = await requireAdmin()
  if ('redirect' in admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const weights = body?.weights
  const submissionConsistency = Number(weights?.submission_consistency)
  const deviceWearConsistency = Number(weights?.device_wear_consistency)
  const pulseCompletion = Number(weights?.pulse_completion)
  const nudgeResponse = Number(weights?.nudge_response)
  const workoutVolume = Number(weights?.workout_volume)

  if (![submissionConsistency, deviceWearConsistency, pulseCompletion, nudgeResponse, workoutVolume].every((value) => Number.isFinite(value))) {
    return NextResponse.json({ error: 'Invalid weights' }, { status: 400 })
  }

  const total = submissionConsistency + deviceWearConsistency + pulseCompletion + nudgeResponse + workoutVolume
  if (total !== 100) {
    return NextResponse.json({ error: 'Weights must sum to 100' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('wellness_director_config')
    .upsert({
      id: 'current',
      weights: {
        submission_consistency: submissionConsistency,
        device_wear_consistency: deviceWearConsistency,
        pulse_completion: pulseCompletion,
        nudge_response: nudgeResponse,
        workout_volume: workoutVolume,
      },
    }, { onConflict: 'id' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ config: data })
}
