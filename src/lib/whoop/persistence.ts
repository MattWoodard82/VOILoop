import type { SupabaseClient } from '@supabase/supabase-js'
import type { ImportResult, ImportRowError, ImportTabResult, ImportBatchStatus } from './types'
import type { MappedExercise, MappedHabits, MappedWellness } from './mappers'

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
}

interface BatchTotals {
  processed: number
  inserted: number
  updated: number
  skipped: number
  failed: number
}

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

export function deriveBatchStatus(totals: BatchTotals): ImportBatchStatus {
  const successes = totals.inserted + totals.updated
  if (totals.failed === 0) return 'completed'
  if (successes === 0) return 'failed'
  return 'partial'
}

async function upsertWorkouts(
  supabase: SupabaseClient,
  batchId: string,
  mapped: MappedExercise,
  allErrors: ImportRowError[],
): Promise<ImportTabResult> {
  const tabResult = emptyTabResult(EXERCISE_TAB, mapped.processed, countByTabs(allErrors, [EXERCISE_TAB]))

  for (const workout of mapped.workouts) {
    const { data: existing, error: existingError } = await supabase
      .from('workouts')
      .select('id')
      .eq('employee_id', workout.employee_id)
      .eq('start_time', workout.start_time)
      .maybeSingle()

    if (existingError) {
      tabResult.failed++
      allErrors.push({ tab: EXERCISE_TAB, row: -1, message: existingError.message })
      continue
    }

    if (existing) {
      const { error } = await supabase
        .from('workouts')
        .update({ ...workout, source_batch_id: batchId })
        .eq('id', existing.id)

      if (error) {
        tabResult.failed++
        allErrors.push({ tab: EXERCISE_TAB, row: -1, message: error.message })
      } else {
        tabResult.updated++
      }
      continue
    }

    const { error } = await supabase
      .from('workouts')
      .insert({ ...workout, source_batch_id: batchId })

    if (error) {
      tabResult.failed++
      allErrors.push({ tab: EXERCISE_TAB, row: -1, message: error.message })
    } else {
      tabResult.inserted++
    }
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

  for (const wellness of mapped.wellness) {
    const { data: existing, error: existingError } = await supabase
      .from('daily_wellness')
      .select('id')
      .eq('employee_id', wellness.employee_id)
      .eq('date', wellness.date)
      .maybeSingle()

    if (existingError) {
      tabResult.failed++
      allErrors.push({ tab: WELLNESS_TAB, row: -1, message: existingError.message })
      continue
    }

    if (existing) {
      const { error } = await supabase
        .from('daily_wellness')
        .update({ ...wellness, source_batch_id: batchId })
        .eq('id', existing.id)

      if (error) {
        tabResult.failed++
        allErrors.push({ tab: WELLNESS_TAB, row: -1, message: error.message })
      } else {
        tabResult.updated++
      }
      continue
    }

    const { error } = await supabase
      .from('daily_wellness')
      .insert({ ...wellness, source_batch_id: batchId })

    if (error) {
      tabResult.failed++
      allErrors.push({ tab: WELLNESS_TAB, row: -1, message: error.message })
    } else {
      tabResult.inserted++
    }
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

  for (const habit of mapped.habits) {
    const { data: existing, error: existingError } = await supabase
      .from('habits')
      .select('id')
      .eq('employee_id', habit.employee_id)
      .eq('date', habit.date)
      .maybeSingle()

    if (existingError) {
      tabResult.failed++
      allErrors.push({ tab: MANUAL_TAB, row: -1, message: existingError.message })
      continue
    }

    if (existing) {
      const { error } = await supabase
        .from('habits')
        .update({ ...habit, source_batch_id: batchId })
        .eq('id', existing.id)

      if (error) {
        tabResult.failed++
        allErrors.push({ tab: MANUAL_TAB, row: -1, message: error.message })
      } else {
        tabResult.updated++
      }
      continue
    }

    const { error } = await supabase
      .from('habits')
      .insert({ ...habit, source_batch_id: batchId })

    if (error) {
      tabResult.failed++
      allErrors.push({ tab: MANUAL_TAB, row: -1, message: error.message })
    } else {
      tabResult.inserted++
    }
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
    const tabResults: ImportTabResult[] = [
      await upsertWorkouts(supabase, batchId, exerciseResult, allErrors),
      await upsertDailyWellness(supabase, batchId, wellnessResult, allErrors),
      await upsertHabits(supabase, batchId, habitsResult, allErrors),
    ]

    const totals = sumTabTotals(tabResults)
    const status = deriveBatchStatus(totals)

    if (allErrors.length) {
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

      if (rowOutcomeError) throw rowOutcomeError
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

    if (batchUpdateError) throw batchUpdateError

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

    if (importLogError) throw importLogError

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

    throw error
  }
}
