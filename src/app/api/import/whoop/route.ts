import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSession } from '@/lib/supabase/server'
import { TAB_EXERCISE, TAB_MANUAL, TAB_SLEEP, TAB_STRESS, parseWorkbook, type ParsedWorkbook } from '@/lib/whoop/parser'
import { validateTabStructure } from '@/lib/whoop/validators'
import { mapExercise, mapWellness, mapManualEntries } from '@/lib/whoop/mappers'
import { persistWhoopImport } from '@/lib/whoop/persistence'
import { createHash } from 'crypto'

export const runtime = 'nodejs'
// Increase body size limit for WHOOP uploads
export const maxDuration = 60
const WHOOP_IMPORT_ALLOWED_ROLES = new Set(['admin', 'staff'])

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'unknown error'
}

function inferCsvWorkbookTabs(workbook: ParsedWorkbook): ParsedWorkbook {
  const sheetNames = Object.keys(workbook)
  const hasNamedWhoopTabs = [TAB_EXERCISE, TAB_STRESS, TAB_SLEEP, TAB_MANUAL].some((tab) => sheetNames.includes(tab))
  if (hasNamedWhoopTabs) return workbook

  const firstSheetName = sheetNames[0]
  if (!firstSheetName) return workbook
  const sourceRows = workbook[firstSheetName] ?? []
  if (!sourceRows.length) return workbook

  const columns = new Set(Object.keys(sourceRows[0]))
  const hasExerciseColumns = columns.has('Workout start time') || columns.has('Activity name')
  const hasWellnessColumns = columns.has('Cycle start time')
  const hasManualColumns = columns.has('Question text') && columns.has('Answered yes')

  const inferred: ParsedWorkbook = {}
  if (hasExerciseColumns) inferred[TAB_EXERCISE] = sourceRows
  if (hasWellnessColumns) inferred[TAB_SLEEP] = sourceRows
  if (hasManualColumns) inferred[TAB_MANUAL] = sourceRows
  return Object.keys(inferred).length ? inferred : workbook
}

function hasRecognizedCsvTab(workbook: ParsedWorkbook): boolean {
  return [TAB_EXERCISE, TAB_STRESS, TAB_SLEEP, TAB_MANUAL].some((tab) => workbook[tab]?.length)
}

function shouldAllowCsvWithPartialStructure(structure: ReturnType<typeof validateTabStructure>, workbook: ParsedWorkbook): boolean {
  return hasRecognizedCsvTab(workbook) && Object.keys(structure.missingColumns).length === 0
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
  const isCsv = fileName.toLowerCase().endsWith('.csv')
  if (!isCsv) {
    return NextResponse.json({ error: 'Only .csv files are supported' }, { status: 400 })
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

  wb = inferCsvWorkbookTabs(wb)

  // Validate tab structure (FR-2, FR-3)
  const structure = validateTabStructure(wb)
  if (!structure.valid) {
    if (isCsv && shouldAllowCsvWithPartialStructure(structure, wb)) {
      // CSV imports can legitimately contain one WHOOP slice; allow row-level validators to handle data quality.
    } else {
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
      if (isCsv && !hasRecognizedCsvTab(wb)) {
        details.push('CSV did not match recognized WHOOP export columns')
      }
      return NextResponse.json({ error: isCsv ? 'Invalid CSV structure' : 'Invalid workbook structure', details }, { status: 422 })
    }
  }

  // Map all tabs
  const exerciseResult = mapExercise(wb)
  const wellnessResult = mapWellness(wb)
  const habitsResult = mapManualEntries(wb)

  const fileHash = createHash('sha256').update(buffer).digest('hex')

  try {
    const result = await persistWhoopImport({
      supabase,
      userId: session.user.id,
      fileName,
      fileSize: file.size,
      fileHash,
      exerciseResult,
      wellnessResult,
      habitsResult,
    })

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to persist import batch',
      detail: toErrorMessage(error),
    }, { status: 500 })
  }
}
