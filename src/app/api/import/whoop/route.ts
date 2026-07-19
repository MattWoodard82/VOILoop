import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSession } from '@/lib/supabase/server'
import {
  parseWorkbook,
  TAB_EXERCISE,
  TAB_SLEEP,
  TAB_STRESS,
  type ParsedWorkbook,
} from '@/lib/whoop/parser'
import { validateTabStructure } from '@/lib/whoop/validators'
import { mapExercise, mapWellness, mapManualEntries } from '@/lib/whoop/mappers'
import { persistWhoopImport } from '@/lib/whoop/persistence'
import {
  prepareWhoopWorkbookForImport,
  type WhoopParticipantProfile,
} from '@/lib/whoop/workbook-context'
import { createHash } from 'crypto'
import { recomputeActiveChallengeProgress } from '@/lib/challenges/progress'
import { isPilotChallengesBasicEnabled } from '@/lib/feature-flags'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
// Increase body size limit for WHOOP uploads
export const maxDuration = 60

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'unknown error'
}

function isMissingUserAccessTable(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false
  const message = (error.message ?? '').toLowerCase()
  return error.code === 'PGRST205' || message.includes('user_access')
}

interface ParticipantParticipantRow {
  id: string
  first_name: string
  last_name: string
  department: string | null
  device_id: string | null
}

async function getSelectedParticipantProfile(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  participantId: string,
): Promise<WhoopParticipantProfile | null> {
  const { data, error } = await supabase
    .from('participants')
    .select('id, first_name, last_name, department, device_id, status')
    .eq('id', participantId)
    .eq('status', 'Active')
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) return null

  const participant = data as ParticipantParticipantRow
  return {
    participantId: participant.id,
    sourceIdentifier: participant.device_id ?? participant.id,
    fullName: `${participant.first_name} ${participant.last_name}`.trim(),
    firstName: participant.first_name,
    lastName: participant.last_name,
    department: participant.department,
  }
}

const REQUIRED_WHOOP_FILES = ['workouts.csv', 'sleeps.csv', 'physiological_cycles.csv'] as const

function getUploadedFiles(formData: FormData): File[] {
  const multiFiles = formData.getAll('files').filter((entry): entry is File => entry instanceof File)
  if (multiFiles.length > 0) return multiFiles

  const legacySingleFile = formData.get('file')
  return legacySingleFile instanceof File ? [legacySingleFile] : []
}

function parseCsvRows(fileBuffer: Buffer): Record<string, unknown>[] {
  const parsedFile = parseWorkbook(fileBuffer)
  const firstSheetName = Object.keys(parsedFile)[0]
  if (!firstSheetName) return []
  return parsedFile[firstSheetName] ?? []
}

function validateWhoopCsvFiles(files: File[]): string[] {
  const errors: string[] = []
  if (files.length !== 3) {
    errors.push('Upload exactly 3 files.')
  }

  const normalizedNames = files.map((file) => file.name.toLowerCase())
  const nonCsvFiles = normalizedNames.filter((name) => !name.endsWith('.csv'))
  if (nonCsvFiles.length > 0) {
    errors.push(`Only .csv files are supported. Found: ${nonCsvFiles.join(', ')}`)
  }

  if (new Set(normalizedNames).size !== normalizedNames.length) {
    errors.push('Duplicate file names are not allowed.')
  }

  const missingFiles = REQUIRED_WHOOP_FILES.filter((requiredName) => !normalizedNames.includes(requiredName))
  if (missingFiles.length > 0) {
    errors.push(`Missing required files: ${missingFiles.join(', ')}`)
  }

  const unexpectedFiles = normalizedNames.filter((name) => !REQUIRED_WHOOP_FILES.includes(name as typeof REQUIRED_WHOOP_FILES[number]))
  if (unexpectedFiles.length > 0) {
    errors.push(`Unexpected files: ${unexpectedFiles.join(', ')}`)
  }

  return errors
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // AC-6: require authenticated session
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerSupabaseClient()
  const { data: accessData, error: accessError } = await supabase
    .from('user_access')
    .select('role')
    .eq('user_id', session.user.id)
    .maybeSingle()

  let role = accessData?.role ?? null
  if (accessError && !isMissingUserAccessTable(accessError)) {
    return NextResponse.json({ error: `Failed to verify role: ${accessError.message}` }, { status: 500 })
  }

  if (!role && accessError) {
    const { data: legacyRoleData, error: legacyRoleError } = await supabase
      .from('user_roles')
      .select('role')
      .single()
    if (legacyRoleError) {
      return NextResponse.json({ error: `Failed to verify role: ${legacyRoleError.message}` }, { status: 500 })
    }
    role = legacyRoleData?.role ?? null
  }

  if (!role) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (role !== 'admin') {
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

  const files = getUploadedFiles(formData)
  if (!files.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 })
  }

  const participantId = String(formData.get('participantId') ?? '').trim()
  if (!participantId) {
    return NextResponse.json({ error: 'Participant is required' }, { status: 400 })
  }

  let selectedParticipantProfile: WhoopParticipantProfile | null = null
  try {
    selectedParticipantProfile = await getSelectedParticipantProfile(supabase, participantId)
  } catch (error) {
    return NextResponse.json({ error: `Failed to load participant: ${toErrorMessage(error)}` }, { status: 500 })
  }
  if (!selectedParticipantProfile) {
    return NextResponse.json({ error: 'Selected participant was not found or is inactive' }, { status: 422 })
  }

  const fileValidationErrors = validateWhoopCsvFiles(files)
  if (fileValidationErrors.length > 0) {
    return NextResponse.json(
      {
        error: 'Invalid WHOOP upload payload',
        details: [
          ...fileValidationErrors,
          'Required files: workouts.csv, sleeps.csv, physiological_cycles.csv',
        ],
      },
      { status: 400 },
    )
  }

  const filesByName = new Map(files.map((file) => [file.name.toLowerCase(), file]))
  const workoutFile = filesByName.get('workouts.csv')
  const sleepFile = filesByName.get('sleeps.csv')
  const physiologicalCyclesFile = filesByName.get('physiological_cycles.csv')
  if (!workoutFile || !sleepFile || !physiologicalCyclesFile) {
    return NextResponse.json(
      {
        error: 'Invalid WHOOP upload payload',
        details: ['Required files: workouts.csv, sleeps.csv, physiological_cycles.csv'],
      },
      { status: 400 },
    )
  }

  let wb: ParsedWorkbook
  let uploadFileHash = createHash('sha256')
  let totalFileSize = 0
  try {
    const workoutBuffer = Buffer.from(await workoutFile.arrayBuffer())
    const sleepBuffer = Buffer.from(await sleepFile.arrayBuffer())
    const physiologicalCyclesBuffer = Buffer.from(await physiologicalCyclesFile.arrayBuffer())

    uploadFileHash = uploadFileHash
      .update('workouts.csv')
      .update(workoutBuffer)
      .update('sleeps.csv')
      .update(sleepBuffer)
      .update('physiological_cycles.csv')
      .update(physiologicalCyclesBuffer)

    totalFileSize = workoutFile.size + sleepFile.size + physiologicalCyclesFile.size

    wb = {
      [TAB_EXERCISE]: parseCsvRows(workoutBuffer),
      [TAB_SLEEP]: parseCsvRows(sleepBuffer),
      [TAB_STRESS]: parseCsvRows(physiologicalCyclesBuffer),
    }
  } catch (error) {
    return NextResponse.json({ error: `Failed to parse uploaded CSV files: ${toErrorMessage(error)}` }, { status: 400 })
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

  let preparedWorkbook = wb
  let participantProfiles: WhoopParticipantProfile[] = []
  try {
    const prepared = await prepareWhoopWorkbookForImport(supabase, wb, {
      authUserId: session.user.id,
      selectedParticipantProfile: selectedParticipantProfile,
    })
    preparedWorkbook = prepared.workbook
    participantProfiles = prepared.participantProfiles
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 422 })
  }

  // Map all tabs
  const exerciseResult = mapExercise(preparedWorkbook)
  const wellnessResult = mapWellness(preparedWorkbook)
  const habitsResult = mapManualEntries(preparedWorkbook)

  const fileHash = uploadFileHash.digest('hex')
  const fileName = 'workouts.csv,sleeps.csv,physiological_cycles.csv'

  try {
    const result = await persistWhoopImport({
      supabase,
      userId: session.user.id,
      fileName,
      fileSize: totalFileSize,
      fileHash,
      exerciseResult,
      wellnessResult,
      habitsResult,
      participantProfiles,
    })

    if (isPilotChallengesBasicEnabled()) {
      const recomputeResult = await recomputeActiveChallengeProgress(supabase, {
        source: 'event',
        batchId: result.batchId,
      })
      if (recomputeResult) {
        logger.info({
          event: 'challenge_recompute_from_whoop_import',
          batchId: result.batchId,
          challenge_id: recomputeResult.challengeId,
          updated_participants: recomputeResult.updatedParticipants,
          finalized: recomputeResult.finalized,
        })
      }
    }

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to persist import batch',
      detail: toErrorMessage(error),
    }, { status: 500 })
  }
}
