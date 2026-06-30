import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSession } from '@/lib/supabase/server'
import { parseWorkbook } from '@/lib/whoop/parser'
import { validateTabStructure } from '@/lib/whoop/validators'
import { mapExercise, mapWellness, mapManualEntries } from '@/lib/whoop/mappers'
import type { ImportResult, ImportTabResult, ImportRowError } from '@/lib/whoop/types'

export const runtime = 'nodejs'
// Increase body size limit for xlsx files (default 4MB is often too small)
export const maxDuration = 60
const WHOOP_IMPORT_ALLOWED_ROLES = new Set(['admin', 'staff'])

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'unknown error'
}

function countValidationFailures(errors: ImportRowError[], tabs: string[]): number {
  const tabSet = new Set(tabs)
  const failedRows = new Set<string>()
  for (const error of errors) {
    if (error.row >= 0 && tabSet.has(error.tab)) {
      failedRows.add(`${error.tab}|${error.row}`)
    }
  }
  return failedRows.size
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // AC-6: require authenticated session
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerSupabaseClient()
  const { data: roleData, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .single()
  if (roleError) {
    return NextResponse.json({ error: `Failed to verify role: ${roleError.message}` }, { status: 500 })
  }
  if (!roleData?.role || !WHOOP_IMPORT_ALLOWED_ROLES.has(roleData.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Invalid content type: expected multipart/form-data' }, { status: 400 })
  }

  // Parse multipart form
  let formData: FormData
  try {
    formData = await req.formData()
  } catch (error) {
    return NextResponse.json(
      { error: `Invalid multipart form data: ${toErrorMessage(error)}` },
      { status: 400 }
    )
  }

  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const fileName = file.name
  if (!fileName.toLowerCase().endsWith('.xlsx')) {
    return NextResponse.json({ error: 'Only .xlsx files are supported' }, { status: 400 })
  }

  // Read file buffer
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Parse workbook
  let wb: ReturnType<typeof parseWorkbook>
  try {
    wb = parseWorkbook(buffer)
  } catch (error) {
    return NextResponse.json({ error: `Failed to parse file: ${toErrorMessage(error)}` }, { status: 400 })
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
  const tabResults: ImportTabResult[] = []

  // ─── Upsert workouts (FR-5, FR-9, AC-4, AC-5) ───────────────────────────────
  // Unique key: (employee_id, start_time)
  {
    const validationFailed = countValidationFailures(exerciseResult.errors, ['Exercise'])
    const tabResult: ImportTabResult = {
      tab: 'Exercise',
      processed: exerciseResult.processed,
      inserted: 0, updated: 0, skipped: 0, failed: 0,
    }
    tabResult.failed = validationFailed

    if (exerciseResult.workouts.length > 0) {
      const existingKeySet = new Set<string>()
      const employeeIds = Array.from(new Set(exerciseResult.workouts.map((w) => w.employee_id)))
      const startTimes = exerciseResult.workouts.map((w) => w.start_time)
      const minStartTime = startTimes.reduce((min, cur) => (cur < min ? cur : min))
      const maxStartTime = startTimes.reduce((max, cur) => (cur > max ? cur : max))

      const { data: existingRows, error: existingError } = await supabase
        .from('workouts')
        .select('employee_id,start_time')
        .in('employee_id', employeeIds)
        .gte('start_time', minStartTime)
        .lte('start_time', maxStartTime)

      if (existingError) {
        tabResult.failed += exerciseResult.workouts.length
        allErrors.push({ tab: 'Exercise', row: -1, message: existingError.message })
      } else {
        for (const row of existingRows ?? []) {
          existingKeySet.add(`${row.employee_id}|${row.start_time}`)
        }

        const { error: upsertError } = await supabase
          .from('workouts')
          .upsert(exerciseResult.workouts, { onConflict: 'employee_id,start_time' })

        if (upsertError) {
          tabResult.failed += exerciseResult.workouts.length
          allErrors.push({ tab: 'Exercise', row: -1, message: upsertError.message })
        } else {
          const updatedCount = exerciseResult.workouts.reduce((count, workout) => {
            const key = `${workout.employee_id}|${workout.start_time}`
            return count + (existingKeySet.has(key) ? 1 : 0)
          }, 0)
          tabResult.updated += updatedCount
          tabResult.inserted += exerciseResult.workouts.length - updatedCount
        }
      }
    }
    tabResults.push(tabResult)
  }

  // ─── Upsert daily wellness (FR-6, FR-9) ─────────────────────────────────────
  // Unique key: (employee_id, date)
  {
    const validationFailed = countValidationFailures(wellnessResult.errors, ['Stress', 'Sleep'])
    const tabResult: ImportTabResult = {
      tab: 'Stress/Sleep',
      processed: wellnessResult.processed,
      inserted: 0, updated: 0, skipped: 0, failed: 0,
    }
    tabResult.failed = validationFailed

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
    const validationFailed = countValidationFailures(habitsResult.errors, ['Manual Entries'])
    const tabResult: ImportTabResult = {
      tab: 'Manual Entries',
      processed: habitsResult.processed,
      inserted: 0, updated: 0, skipped: 0, failed: 0,
    }
    tabResult.failed = validationFailed

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
  const { error: auditLogError } = await supabase.from('import_logs').insert({
    imported_by: session.user.id,
    file_name: fileName,
    rows_processed: totals.processed,
    rows_inserted: totals.inserted,
    rows_updated: totals.updated,
    rows_skipped: totals.skipped,
    rows_failed: totals.failed,
    error_detail: allErrors.length ? allErrors : null,
  })
  if (auditLogError) {
    return NextResponse.json(
      { error: `Failed to write import audit log: ${auditLogError.message}` },
      { status: 500 }
    )
  }

  const result: ImportResult = {
    success: totals.failed < totals.processed || totals.processed === 0,
    fileName,
    tabs: tabResults,
    totals,
    errors: allErrors,
  }

  return NextResponse.json(result, { status: 200 })
}
