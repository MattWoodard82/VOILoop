import { NextResponse } from 'next/server'
import { createServerSupabaseClient, requireAdmin, getSession, getUserAccess } from '@/lib/supabase/server'
import { normalizeEngagementWeights, isValidEngagementWeights } from '@/lib/wellness-director-config'

export const runtime = 'nodejs'

export async function GET() {
  // Wellness Directors need to read config to display their dashboard weights; admins can also read.
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await getUserAccess(session.user.id)
  if (access.role !== 'admin' && access.role !== 'wellness_director') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('wellness_director_config')
    .select('*')
    .eq('id', 'current')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ config: { id: 'current', weights: normalizeEngagementWeights(data?.weights) } })
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

  const values = [submissionConsistency, deviceWearConsistency, pulseCompletion, nudgeResponse, workoutVolume]
  if (!values.every((value) => Number.isFinite(value))) {
    return NextResponse.json({ error: 'Invalid weights' }, { status: 400 })
  }

  if (!isValidEngagementWeights(values)) {
    return NextResponse.json({ error: 'Weights must each be within 0-100 and sum to 100' }, { status: 400 })
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
