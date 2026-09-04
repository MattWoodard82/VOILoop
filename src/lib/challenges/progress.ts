import { buildCompletionIdempotencyKey } from '@/lib/challenge-rules'
import { logger } from '@/lib/logger'

interface SupabaseLike {
  from: (table: string) => any
}

interface ChallengeParticipantRow {
  id: string
  participant_id: string
  progress_value: number
  completed: boolean
  updated_at: string | null
}

interface RecomputeOptions {
  source?: 'scheduled_recompute' | 'event'
  batchId?: string
}

// PostgREST (and therefore Supabase's default client) caps a single select
// response at its configured max rows (1,000 by default). A challenge window
// can easily span more rows than that across all participants, so every
// window query below pages through results with `.range()` instead of
// fetching in one shot, to avoid silently truncating (and thus undercounting)
// progress.
const FETCH_PAGE_SIZE = 1000

async function fetchAllRows<T>(
  buildPage: (rangeStart: number, rangeEnd: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await buildPage(offset, offset + FETCH_PAGE_SIZE - 1)
    if (error) {
      throw new Error(error.message)
    }
    const page = data ?? []
    rows.push(...page)
    if (page.length < FETCH_PAGE_SIZE) break
    offset += FETCH_PAGE_SIZE
  }
  return rows
}

// actions_count metric: counts workouts logged per participant within the
// challenge window.
async function countWorkouts(
  supabase: SupabaseLike,
  windowStartAt: string,
  windowEndAt: string,
): Promise<Map<string, number>> {
  const workouts = await fetchAllRows<{ participant_id: string; start_time: string }>((rangeStart, rangeEnd) =>
    supabase
      .from('workouts')
      .select('participant_id, start_time')
      .gte('start_time', windowStartAt)
      .lte('start_time', windowEndAt)
      .range(rangeStart, rangeEnd),
  )

  const counts = new Map<string, number>()
  for (const workout of workouts) {
    const participantId = String(workout.participant_id ?? '')
    if (!participantId) continue
    counts.set(participantId, (counts.get(participantId) ?? 0) + 1)
  }
  return counts
}

// device_wear_consistency metric (FR-13, Issue #66): counts days per
// participant within the challenge window that have valid sleep+recovery
// data — the same "wore the device" signal used by engagement scoring in
// getWellnessDirectorParticipants() (src/lib/supabase/queries.ts) — rather
// than counting logged workouts. Kept in sync with that predicate: a valid
// day requires a recovery score plus either sleep_perf or sleep_hrs, since
// some wearables only report one of the two sleep fields.
async function countValidWearDays(
  supabase: SupabaseLike,
  windowStartAt: string,
  windowEndAt: string,
): Promise<Map<string, number>> {
  const wellnessRows = await fetchAllRows<{
    participant_id: string
    date: string
    recovery_score: number | null
    sleep_perf: number | null
    sleep_hrs: number | null
  }>((rangeStart, rangeEnd) =>
    supabase
      .from('daily_wellness')
      .select('participant_id, date, recovery_score, sleep_perf, sleep_hrs')
      .gte('date', windowStartAt)
      .lte('date', windowEndAt)
      .range(rangeStart, rangeEnd),
  )

  const counts = new Map<string, number>()
  for (const row of wellnessRows) {
    const participantId = String(row.participant_id ?? '')
    if (!participantId) continue
    const hasValidWearData = row.recovery_score !== null && row.recovery_score !== undefined
      && (row.sleep_perf !== null && row.sleep_perf !== undefined || row.sleep_hrs !== null && row.sleep_hrs !== undefined)
    if (!hasValidWearData) continue
    counts.set(participantId, (counts.get(participantId) ?? 0) + 1)
  }
  return counts
}

export async function recomputeActiveChallengeProgress(
  supabase: SupabaseLike,
  options: RecomputeOptions = {},
): Promise<{ challengeId: string; updatedParticipants: number; finalized: boolean } | null> {
  const now = new Date().toISOString()
  const source = options.source ?? 'scheduled_recompute'
  const { data: activeChallenge, error: activeChallengeError } = await supabase
    .from('challenges')
    .select('id, status, metric_type, threshold_value, window_start_at, window_end_at, version')
    .eq('status', 'active')
    .maybeSingle()

  if (activeChallengeError) {
    throw new Error(activeChallengeError.message)
  }
  if (!activeChallenge || activeChallenge.status !== 'active') return null

  const { data: participants, error: participantsError } = await supabase
    .from('challenge_participants')
    .select('id, participant_id, progress_value, completed, updated_at')
    .eq('challenge_id', activeChallenge.id)
    .eq('is_eligible', true)

  if (participantsError) {
    throw new Error(participantsError.message)
  }

  const metricType = activeChallenge.metric_type ?? 'actions_count'
  const counts =
    metricType === 'device_wear_consistency'
      ? await countValidWearDays(supabase, activeChallenge.window_start_at, activeChallenge.window_end_at)
      : await countWorkouts(supabase, activeChallenge.window_start_at, activeChallenge.window_end_at)

  const participantRows = (participants ?? []) as ChallengeParticipantRow[]
  const updateRequests = participantRows.map((participant) => {
    const recomputedCount = counts.get(participant.participant_id) ?? 0
    // Never decrement: take the higher of the recomputed count and the stored value
    const progressValue = Math.max(recomputedCount, participant.progress_value ?? 0)
    const isCompleteNow = progressValue >= activeChallenge.threshold_value

    // Include challenge_id and participant_id even though we're conflicting on
    // `id`: Postgres validates NOT NULL constraints against the row being
    // inserted before ON CONFLICT DO UPDATE ever resolves, so omitting these
    // required columns fails the upsert with a not-null violation on every
    // recompute (this was silently breaking CSV-triggered progress updates).
    const updatePayload: Record<string, unknown> = {
      id: participant.id,
      challenge_id: activeChallenge.id,
      participant_id: participant.participant_id,
      progress_value: progressValue,
      updated_at: now,
    }

    if (!participant.completed && isCompleteNow) {
      updatePayload.completed = true
      updatePayload.completed_at = now
      updatePayload.completion_source = source
      updatePayload.completion_idempotency_key = buildCompletionIdempotencyKey(activeChallenge.id, participant.participant_id)
    }

    return updatePayload
  })
  const batchSize = 500
  for (let i = 0; i < updateRequests.length; i += batchSize) {
    const batch = updateRequests.slice(i, i + batchSize)
    const { error: updateError } = await supabase
      .from('challenge_participants')
      .upsert(batch, { onConflict: 'id' })

    if (updateError) throw new Error(updateError.message)
  }
  const updatedParticipants = updateRequests.length

  const maxLastComputedAt = participantRows
    .map((participant) => String(participant.updated_at ?? ''))
    .filter(Boolean)
    .sort()
    .at(-1) ?? null
  const recomputeLagMinutes = maxLastComputedAt
    ? Math.max(0, Math.round((new Date(now).getTime() - new Date(maxLastComputedAt).getTime()) / 60000))
    : 0

  let finalized = false
  const nowMs = new Date(now).getTime()
  const windowEndMs = new Date(activeChallenge.window_end_at).getTime()
  if (Number.isFinite(windowEndMs) && nowMs >= windowEndMs) {
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
