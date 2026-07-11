import { buildCompletionIdempotencyKey } from '@/lib/challenge-rules'
import { logger } from '@/lib/logger'

interface SupabaseLike {
  from: (table: string) => any
}

interface ChallengeParticipantRow {
  id: string
  employee_id: string
  completed: boolean
  updated_at: string | null
}

interface RecomputeOptions {
  source?: 'scheduled_recompute' | 'event'
  batchId?: string
}

export async function recomputeActiveChallengeProgress(
  supabase: SupabaseLike,
  options: RecomputeOptions = {},
): Promise<{ challengeId: string; updatedParticipants: number; finalized: boolean } | null> {
  const now = new Date().toISOString()
  const source = options.source ?? 'scheduled_recompute'
  const { data: activeChallenge, error: activeChallengeError } = await supabase
    .from('challenges')
    .select('id, status, threshold_value, window_start_at, window_end_at, version')
    .eq('status', 'active')
    .maybeSingle()

  if (activeChallengeError) {
    throw new Error(activeChallengeError.message)
  }
  if (!activeChallenge || activeChallenge.status !== 'active') return null

  const { data: participants, error: participantsError } = await supabase
    .from('challenge_participants')
    .select('id, employee_id, completed, updated_at')
    .eq('challenge_id', activeChallenge.id)
    .eq('is_eligible', true)

  if (participantsError) {
    throw new Error(participantsError.message)
  }

  const { data: workouts, error: workoutsError } = await supabase
    .from('workouts')
    .select('employee_id, start_time')
    .gte('start_time', activeChallenge.window_start_at)
    .lte('start_time', activeChallenge.window_end_at)

  if (workoutsError) {
    throw new Error(workoutsError.message)
  }

  const counts = new Map<string, number>()
  for (const workout of workouts ?? []) {
    const employeeId = String(workout.employee_id ?? '')
    if (!employeeId) continue
    counts.set(employeeId, (counts.get(employeeId) ?? 0) + 1)
  }

  let updatedParticipants = 0
  for (const participant of participants ?? []) {
    const progressValue = counts.get(participant.employee_id) ?? 0
    const isCompleteNow = progressValue >= activeChallenge.threshold_value

    const updatePayload: Record<string, unknown> = {
      progress_value: progressValue,
      updated_at: now,
    }

    if (!participant.completed && isCompleteNow) {
      updatePayload.completed = true
      updatePayload.completed_at = now
      updatePayload.completion_source = source
      updatePayload.completion_idempotency_key = buildCompletionIdempotencyKey(activeChallenge.id, participant.employee_id)
    }

    const { error: updateError } = await supabase
      .from('challenge_participants')
      .update(updatePayload)
      .eq('id', participant.id)

    if (updateError) {
      throw new Error(updateError.message)
    }
    updatedParticipants += 1
  }

  const maxLastComputedAt = ((participants ?? []) as ChallengeParticipantRow[])
    .map((participant) => String(participant.updated_at ?? ''))
    .filter(Boolean)
    .sort()
    .at(-1) ?? null
  const recomputeLagMinutes = maxLastComputedAt
    ? Math.max(0, Math.round((new Date(now).getTime() - new Date(maxLastComputedAt).getTime()) / 60000))
    : 0

  let finalized = false
  if (now >= activeChallenge.window_end_at) {
    const { data: finalizedChallenge, error: finalizeError } = await supabase
      .from('challenges')
      .update({
        status: 'completed',
        completed_at: now,
        updated_at: now,
        version: activeChallenge.version + 1,
      })
      .eq('id', activeChallenge.id)
      .eq('status', 'active')
      .eq('version', activeChallenge.version)
      .select('id')
      .maybeSingle()

    if (finalizeError) throw new Error(finalizeError.message)
    finalized = Boolean(finalizedChallenge)

    if (finalized) {
      await supabase
        .from('challenge_audit_log')
        .insert({
          challenge_id: activeChallenge.id,
          actor_id: null,
          action: 'complete',
          before: { status: 'active' },
          after: { status: 'completed', completed_at: now },
          context: { source: 'challenge.window.auto_complete' },
        })
    }
  }

  await supabase
    .from('challenge_audit_log')
    .insert({
      challenge_id: activeChallenge.id,
      actor_id: null,
      action: 'recompute',
      before: null,
      after: null,
      context: {
        source: 'challenge.progress.recompute',
        updated_participants: updatedParticipants,
        recompute_source: source,
        batch_id: options.batchId ?? null,
        recompute_lag_minutes: recomputeLagMinutes,
      },
    })

  logger.info({
    event: 'challenge_recompute_completed',
    challenge_id: activeChallenge.id,
    recompute_source: source,
    batch_id: options.batchId ?? null,
    updated_participants: updatedParticipants,
    recompute_lag_minutes: recomputeLagMinutes,
    finalized,
  })

  if (recomputeLagMinutes > 30) {
    logger.warn({
      event: 'challenge_recompute_lag_high',
      challenge_id: activeChallenge.id,
      recompute_lag_minutes: recomputeLagMinutes,
    })
  }

  return { challengeId: activeChallenge.id, updatedParticipants, finalized }
}
