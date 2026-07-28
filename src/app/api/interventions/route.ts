import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { requireInterventionOperator } from '@/lib/interventions/access'
import { normalizeCreateInterventionInput, validateCreateInterventionInput } from '@/lib/interventions/validators'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = await requireInterventionOperator()
  if ('error' in auth) return auth.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const input = normalizeCreateInterventionInput(body)
  const validation = validateCreateInterventionInput(input)
  if (!validation.ok) {
    return NextResponse.json(
      {
        error: 'Invalid intervention payload',
        code: 'INVALID_INTERVENTION',
        details: validation.details,
      },
      { status: 400 },
    )
  }

  const supabase = createAdminSupabaseClient()
  const { data: participant, error: participantError } = await supabase
    .from('participants')
    .select('id, department, status')
    .eq('id', input.participant_id)
    .maybeSingle()

  if (participantError) return NextResponse.json({ error: participantError.message }, { status: 500 })
  if (!participant || participant.status !== 'Active') {
    return NextResponse.json(
      { error: 'Invalid participant_id', code: 'INVALID_PARTICIPANT' },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from('interventions')
    .insert({
      participant_id: input.participant_id,
      date_triggered: input.date_triggered,
      department: participant.department ?? null,
      trigger_metric: input.trigger_metric,
      trigger_value: input.trigger_value,
      intervention_type: input.intervention_type,
      assigned_to: input.assigned_to,
      date_actioned: null,
      outcome: 'Pending',
      notes: input.notes,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  logger.info({
    event: 'intervention_created',
    intervention_id: data.id,
    participant_id: data.participant_id,
    actor_id: auth.userId,
    actor_role: auth.role,
    outcome: data.outcome,
  })

  return NextResponse.json(data, { status: 201 })
}
