import type { SupabaseClient } from '@supabase/supabase-js'
import type { ImportResult, ImportRowError, ImportTabResult, ImportBatchStatus } from './types'
import type { MappedExercise, MappedHabits, MappedWellness } from './mappers'
import type { WhoopParticipantProfile } from './workbook-context'
import { logger } from '@/lib/logger'

const EXERCISE_TAB = 'Exercise'
const WELLNESS_TAB = 'Stress/Sleep'
const MANUAL_TAB = 'Manual Entries'

interface PersistWhoopImportParams {
  supabase: SupabaseClient
  userId: string
  fileName: string
  fileSize: number
  fileHash: string
  exerciseResult: MappedExercise
  wellnessResult: MappedWellness
  habitsResult: MappedHabits
  participantProfiles: WhoopParticipantProfile[]
}

interface BatchTotals {
  processed: number
  inserted: number
  updated: number
  skipped: number
  failed: number
}

const UPSERT_CHUNK_SIZE = 250

function countByTabs(errors: ImportRowError[], tabs: string[]): number {
  return errors.filter((error) => tabs.includes(error.tab)).length
}

function emptyTabResult(tab: string, processed: number, failed: number): ImportTabResult {
  return { tab, processed, inserted: 0, updated: 0, skipped: 0, failed }
}

function sumTabTotals(tabResults: ImportTabResult[]): BatchTotals {
  return tabResults.reduce(
    (acc, tab) => ({
      processed: acc.processed + tab.processed,
      inserted: acc.inserted + tab.inserted,
      updated: acc.updated + tab.updated,
      skipped: acc.skipped + tab.skipped,
      failed: acc.failed + tab.failed,
    }),
    { processed: 0, inserted: 0, updated: 0, skipped: 0, failed: 0 },
  )
}

function logImportRowErrors(batchId: string, fileName: string, userId: string, errors: ImportRowError[]) {
  errors.forEach((error) => {
    logger.warn({
      event: 'whoop_import_row_error',
      batchId,
      fileName,
      userId,
      tab: error.tab,
      row: error.row,
      field: error.field ?? null,
      message: error.message,
    })
  })
}

export function deriveBatchStatus(totals: BatchTotals): ImportBatchStatus {
  const successes = totals.inserted + totals.updated
  if (totals.failed === 0) return 'completed'
  if (successes === 0) return 'failed'
  return 'partial'
}

async function ensureParticipantsExist(
  supabase: SupabaseClient,
  participantProfiles: WhoopParticipantProfile[],
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  const uniqueProfiles = Array.from(
    new Map(participantProfiles.map((profile) => [profile.participantId, profile])).values(),
  )

  for (const profile of uniqueProfiles) {
    const { data: existingParticipant, error: existingParticipantError } = await supabase
      .from('participants')
      .select('id, device_id')
      .eq('id', profile.participantId)
      .maybeSingle()

    if (existingParticipantError) {
      throw existingParticipantError
    }

    if (!existingParticipant) {
      const { error: insertParticipantError } = await supabase
        .from('participants')
        .insert({
          id: profile.participantId,
          first_name: profile.firstName,
          last_name: profile.lastName,
          department: profile.department,
          title: 'WHOOP Participant',
          device_id:
            profile.sourceIdentifier && profile.sourceIdentifier !== profile.participantId
              ? profile.sourceIdentifier
              : null,
          consent: true,
          enrolled_date: today,
          status: 'Active',
          is_exact_data: false,
        })

      if (insertParticipantError) {
        throw insertParticipantError
      }

      continue
    }

    if (!existingParticipant.device_id && profile.sourceIdentifier && profile.sourceIdentifier !== profile.participantId) {
      const { error: updateParticipantError } = await supabase
        .from('participants')
        .update({ device_id: profile.sourceIdentifier })
        .eq('id', profile.participantId)

      if (updateParticipantError) {
        throw updateParticipantError
      }
    }
  }
}

function buildFallbackParticipantProfiles(
  exerciseResult: MappedExercise,
  wellnessResult: MappedWellness,
  habitsResult: MappedHabits,
  participantProfiles: WhoopParticipantProfile[],
): WhoopParticipantProfile[] {
  const profilesById = new Map(participantProfiles.map((profile) => [profile.participantId, profile]))
  const participantIds = new Set<string>()

  exerciseResult.workouts.forEach((workout) => participantIds.add(workout.participant_id))
  wellnessResult.wellness.forEach((wellness) => participantIds.add(wellness.participant_id))
  habitsResult.habits.forEach((habit) => participantIds.add(habit.participant_id))

  for (const participantId of Array.from(participantIds)) {
    if (profilesById.has(participantId)) continue
    profilesById.set(participantId, {
      participantId,
      sourceIdentifier: participantId,
      fullName: null,
      firstName: 'WHOOP',
      lastName: 'Participant',
      department: null,
    })
  }

  return Array.from(profilesById.values())
}

async function upsertWorkouts(
  supabase: SupabaseClient,
  batchId: string,
  mapped: MappedExercise,
  allErrors: ImportRowError[],
): Promise<ImportTabResult> {
  const tabResult = emptyTabResult(EXERCISE_TAB, mapped.processed, countByTabs(allErrors, [EXERCISE_TAB]))
  const rows = mapped.workouts

  for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE)
    const participantIds = Array.from(new Set(chunk.map((row) => row.participant_id)))
    const startTimes = Array.from(new Set(chunk.map((row) => row.start_time)))

    const { data: existingRows, error: existingError } = await supabase
      .from('workouts')
      .select('participant_id,start_time')
      .in('participant_id', participantIds)
      .in('start_time', startTimes)

    if (existingError) {
      tabResult.failed += chunk.length
      allErrors.push({ tab: EXERCISE_TAB, row: -1, message: existingError.message })
      continue
    }

    const existingKeys = new Set((existingRows ?? []).map((row) => `${row.participant_id}|${row.start_time}`))
    const chunkRows = chunk.map((row) => ({ ...row, source_batch_id: batchId }))
    const { error: upsertError } = await supabase
      .from('workouts')
      .upsert(chunkRows, { onConflict: 'participant_id,start_time' })

    if (upsertError) {
      tabResult.failed += chunk.length
      allErrors.push({ tab: EXERCISE_TAB, row: -1, message: upsertError.message })
      continue
    }

    const updated = chunk.filter((row) => existingKeys.has(`${row.participant_id}|${row.start_time}`)).length
    tabResult.updated += updated
    tabResult.inserted += chunk.length - updated
  }

  return tabResult
}

async function upsertDailyWellness(
  supabase: SupabaseClient,
  batchId: string,
  mapped: MappedWellness,
  allErrors: ImportRowError[],
): Promise<ImportTabResult> {
  const tabResult = emptyTabResult(
    WELLNESS_TAB,
    mapped.processed,
    countByTabs(allErrors, ['Stress', 'Sleep', WELLNESS_TAB]),
  )
  const rows = mapped.wellness

  for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE)
    const participantIds = Array.from(new Set(chunk.map((row) => row.participant_id)))
    const dates = Array.from(new Set(chunk.map((row) => row.date)))

    const { data: existingRows, error: existingError } = await supabase
      .from('daily_wellness')
      .select('participant_id,date')
      .in('participant_id', participantIds)
      .in('date', dates)

    if (existingError) {
      tabResult.failed += chunk.length
      allErrors.push({ tab: WELLNESS_TAB, row: -1, message: existingError.message })
      continue
    }

    const existingKeys = new Set((existingRows ?? []).map((row) => `${row.participant_id}|${row.date}`))
    const chunkRows = chunk.map((row) => ({ ...row, source_batch_id: batchId }))
    const { error: upsertError } = await supabase
      .from('daily_wellness')
      .upsert(chunkRows, { onConflict: 'participant_id,date' })

    if (upsertError) {
      tabResult.failed += chunk.length
      allErrors.push({ tab: WELLNESS_TAB, row: -1, message: upsertError.message })
      continue
    }

    const updated = chunk.filter((row) => existingKeys.has(`${row.participant_id}|${row.date}`)).length
    tabResult.updated += updated
    tabResult.inserted += chunk.length - updated
  }

  return tabResult
}

async function upsertHabits(
  supabase: SupabaseClient,
  batchId: string,
  mapped: MappedHabits,
  allErrors: ImportRowError[],
): Promise<ImportTabResult> {
  const tabResult = emptyTabResult(MANUAL_TAB, mapped.processed, countByTabs(allErrors, [MANUAL_TAB]))
  const rows = mapped.habits

  for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE)
    const participantIds = Array.from(new Set(chunk.map((row) => row.participant_id)))
    const dates = Array.from(new Set(chunk.map((row) => row.date)))

    const { data: existingRows, error: existingError } = await supabase
      .from('habits')
      .select('participant_id,date')
      .in('participant_id', participantIds)
      .in('date', dates)

    if (existingError) {
      tabResult.failed += chunk.length
      allErrors.push({ tab: MANUAL_TAB, row: -1, message: existingError.message })
      continue
    }

    const existingKeys = new Set((existingRows ?? []).map((row) => `${row.participant_id}|${row.date}`))
    const chunkRows = chunk.map((row) => ({ ...row, source_batch_id: batchId }))
    const { error: upsertError } = await supabase
      .from('habits')
      .upsert(chunkRows, { onConflict: 'participant_id,date' })

    if (upsertError) {
      tabResult.failed += chunk.length
      allErrors.push({ tab: MANUAL_TAB, row: -1, message: upsertError.message })
      continue
    }

    const updated = chunk.filter((row) => existingKeys.has(`${row.participant_id}|${row.date}`)).length
    tabResult.updated += updated
    tabResult.inserted += chunk.length - updated
  }

  return tabResult
}

export async function persistWhoopImport(params: PersistWhoopImportParams): Promise<ImportResult> {
  const {
    supabase,
    userId,
    fileName,
    fileSize,
    fileHash,
    exerciseResult,
    wellnessResult,
    habitsResult,
    participantProfiles,
  } = params

  const allErrors: ImportRowError[] = [
    ...exerciseResult.errors,
    ...wellnessResult.errors,
    ...habitsResult.errors,
  ]

  const { data: createdBatch, error: batchError } = await supabase
    .from('upload_batches')
    .insert({
      imported_by: userId,
      file_name: fileName,
      file_size_bytes: fileSize,
      file_hash_sha256: fileHash,
      status: 'processing',
    })
    .select('id')
    .single()

  if (batchError) throw batchError
  const batchId = createdBatch.id as string

  try {
    await ensureParticipantsExist(
      supabase,
      buildFallbackParticipantProfiles(exerciseResult, wellnessResult, habitsResult, participantProfiles),
    )

    const tabResults: ImportTabResult[] = [
      await upsertWorkouts(supabase, batchId, exerciseResult, allErrors),
      await upsertDailyWellness(supabase, batchId, wellnessResult, allErrors),
      await upsertHabits(supabase, batchId, habitsResult, allErrors),
    ]

    const totals = sumTabTotals(tabResults)
    const status = deriveBatchStatus(totals)

    if (allErrors.length) {
      logImportRowErrors(batchId, fileName, userId, allErrors)

      const rowOutcomeRows = allErrors.map((error) => ({
        batch_id: batchId,
        tab_name: error.tab,
        row_number: error.row,
        field_name: error.field ?? null,
        outcome: 'failed',
        message: error.message,
      }))

      const { error: rowOutcomeError } = await supabase
        .from('import_row_outcomes')
        .insert(rowOutcomeRows)

      if (rowOutcomeError) {
        logger.error({
          event: 'whoop_import_row_outcomes_persist_failed',
          batchId,
          fileName,
          userId,
          message: rowOutcomeError.message,
        })
        throw rowOutcomeError
      }
    }

    const { error: batchUpdateError } = await supabase
      .from('upload_batches')
      .update({
        status,
        completed_at: new Date().toISOString(),
        rows_processed: totals.processed,
        rows_inserted: totals.inserted,
        rows_updated: totals.updated,
        rows_skipped: totals.skipped,
        rows_failed: totals.failed,
      })
      .eq('id', batchId)

    if (batchUpdateError) {
      logger.error({
        event: 'whoop_import_batch_update_failed',
        batchId,
        fileName,
        userId,
        message: batchUpdateError.message,
      })
      throw batchUpdateError
    }

    const { error: importLogError } = await supabase.from('import_logs').insert({
      batch_id: batchId,
      imported_by: userId,
      file_name: fileName,
      rows_processed: totals.processed,
      rows_inserted: totals.inserted,
      rows_updated: totals.updated,
      rows_skipped: totals.skipped,
      rows_failed: totals.failed,
      error_detail: allErrors.length ? allErrors : null,
    })

    if (importLogError) {
      logger.error({
        event: 'whoop_import_log_persist_failed',
        batchId,
        fileName,
        userId,
        message: importLogError.message,
      })
      throw importLogError
    }

    logger.info({
      event: 'whoop_import_completed',
      batchId,
      fileName,
      userId,
      status,
      totals,
    })

    return {
      batchId,
      status,
      success: status !== 'failed',
      fileName,
      tabs: tabResults,
      totals,
      errors: allErrors,
    }
  } catch (error) {
    await supabase
      .from('upload_batches')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', batchId)

    logger.error({
      event: 'whoop_import_failed',
      batchId,
      fileName,
      userId,
      message: error instanceof Error ? error.message : String(error),
    })

    throw error
  }
}
