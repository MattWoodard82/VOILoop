import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSession } from '@/lib/supabase/server'
import { parseWorkbook } from '@/lib/whoop/parser'
import { validateTabStructure } from '@/lib/whoop/validators'
import { mapExercise, mapWellness, mapManualEntries } from '@/lib/whoop/mappers'
import type { ImportResult, ImportTabResult, ImportRowError } from '@/lib/whoop/types'

export const runtime = 'nodejs'
// Increase body size limit for xlsx files (default 4MB is often too small)
export const maxDuration = 60

export async function POST(req: NextRequest): Promise<NextResponse> {
  // AC-6: require authenticated session
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse multipart form
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const fileName = file.name
  if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.csv')) {
    return NextResponse.json({ error: 'Only .xlsx and .csv files are supported' }, { status: 400 })
  }

  // Read file buffer
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Parse workbook
  let wb: ReturnType<typeof parseWorkbook>
  try {
    wb = parseWorkbook(buffer)
  } catch (e) {
    return NextResponse.json({ error: `Failed to parse file: ${(e as Error).message}` }, { status: 400 })
  }

  // Validate tab structure (FR-2, FR-3)
  const structure = validateTabStructure(wb)
  if (!structure.valid) {
    const details: string[] = []
    if (structure.missingRequiredTabs.length) {
      details.push(`Missing required tabs: ${structure.missingRequiredTabs.join(', ')}`)
    }
    if (structure.missingAtLeastOneTab) {
      details.push('At least one of "Stress" or "Sleep" tabs must be present')
    }
    for (const [tab, cols] of Object.entries(structure.missingColumns)) {
      details.push(`Tab "${tab}" missing columns: ${cols.join(', ')}`)
    }
    return NextResponse.json({ error: 'Invalid workbook structure', details }, { status: 422 })
  }

  // Map all tabs
  const exerciseResult = mapExercise(wb)
  const wellnessResult = mapWellness(wb)
  const habitsResult = mapManualEntries(wb)

  const allErrors: ImportRowError[] = [
    ...exerciseResult.errors,
    ...wellnessResult.errors,
    ...habitsResult.errors,
  ]

  const supabase = createServerSupabaseClient()
  const tabResults: ImportTabResult[] = []

  // ─── Upsert workouts (FR-5, FR-9, AC-4, AC-5) ───────────────────────────────
  // Unique key: (employee_id, start_time)
  {
    const tabResult: ImportTabResult = {
      tab: 'Exercise',
      processed: exerciseResult.processed,
      inserted: 0, updated: 0, skipped: 0, failed: 0,
    }

    for (const workout of exerciseResult.workouts) {
      const { data: existing } = await supabase
        .from('workouts')
        .select('id')
        .eq('employee_id', workout.employee_id)
        .eq('start_time', workout.start_time)
        .maybeSingle()

      if (existing) {
        const { error } = await supabase
          .from('workouts')
          .update(workout)
          .eq('id', existing.id)
        if (error) {
          tabResult.failed++
          allErrors.push({ tab: 'Exercise', row: -1, message: error.message })
        } else {
          tabResult.updated++
        }
      } else {
        const { error } = await supabase.from('workouts').insert(workout)
        if (error) {
          tabResult.failed++
          allErrors.push({ tab: 'Exercise', row: -1, message: error.message })
        } else {
          tabResult.inserted++
        }
      }
    }
    tabResults.push(tabResult)
  }

  // ─── Upsert daily wellness (FR-6, FR-9) ─────────────────────────────────────
  // Unique key: (employee_id, date)
  {
    const tabResult: ImportTabResult = {
      tab: 'Stress/Sleep',
      processed: wellnessResult.processed,
      inserted: 0, updated: 0, skipped: 0, failed: 0,
    }

    for (const wellness of wellnessResult.wellness) {
      const { error } = await supabase
        .from('daily_wellness')
        .upsert(wellness, { onConflict: 'employee_id,date' })
      if (error) {
        tabResult.failed++
        allErrors.push({ tab: 'Stress/Sleep', row: -1, message: error.message })
      } else {
        tabResult.inserted++ // Supabase upsert doesn't distinguish insert vs update
      }
    }
    tabResults.push(tabResult)
  }

  // ─── Upsert habits (FR-7, FR-9) ─────────────────────────────────────────────
  // Unique key: (employee_id, date)
  {
    const tabResult: ImportTabResult = {
      tab: 'Manual Entries',
      processed: habitsResult.processed,
      inserted: 0, updated: 0, skipped: 0, failed: 0,
    }

    for (const habit of habitsResult.habits) {
      const { error } = await supabase
        .from('habits')
        .upsert(habit, { onConflict: 'employee_id,date' })
      if (error) {
        tabResult.failed++
        allErrors.push({ tab: 'Manual Entries', row: -1, message: error.message })
      } else {
        tabResult.inserted++
      }
    }
    tabResults.push(tabResult)
  }

  // ─── Compute totals ──────────────────────────────────────────────────────────
  const totals = tabResults.reduce(
    (acc, t) => ({
      processed: acc.processed + t.processed,
      inserted: acc.inserted + t.inserted,
      updated: acc.updated + t.updated,
      skipped: acc.skipped + t.skipped,
      failed: acc.failed + t.failed,
    }),
    { processed: 0, inserted: 0, updated: 0, skipped: 0, failed: 0 }
  )

  // ─── Persist audit log ───────────────────────────────────────────────────────
  await supabase.from('import_logs').insert({
    imported_by: session.user.id,
    file_name: fileName,
    rows_processed: totals.processed,
    rows_inserted: totals.inserted,
    rows_updated: totals.updated,
    rows_skipped: totals.skipped,
    rows_failed: totals.failed,
    error_detail: allErrors.length ? allErrors : null,
  })

  const result: ImportResult = {
    success: totals.failed < totals.processed || totals.processed === 0,
    fileName,
    tabs: tabResults,
    totals,
    errors: allErrors,
  }

  return NextResponse.json(result, { status: 200 })
}
