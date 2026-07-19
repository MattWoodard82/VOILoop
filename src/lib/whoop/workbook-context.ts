import type { SupabaseClient } from '@supabase/supabase-js'
import {
  TAB_CONDENSED,
  TAB_EXERCISE,
  TAB_MANUAL,
  TAB_SLEEP,
  TAB_STRESS,
  type ParsedWorkbook,
} from './parser'

const IMPORT_TABS = [TAB_EXERCISE, TAB_STRESS, TAB_SLEEP, TAB_MANUAL] as const
const PARTICIPANT_IDENTIFIER_FIELD = 'Participant Identifier'

export interface WhoopParticipantProfile {
  participantId: string
  sourceIdentifier: string | null
  fullName: string | null
  firstName: string
  lastName: string
  department: string | null
}

export interface PreparedWhoopWorkbook {
  workbook: ParsedWorkbook
  participantProfiles: WhoopParticipantProfile[]
}

export interface PrepareWhoopWorkbookOptions {
  authUserId?: string | null
  selectedParticipantProfile?: WhoopParticipantProfile | null
}

interface ParticipantRow {
  id: string
  auth_user_id?: string | null
  first_name: string
  last_name: string
  department: string | null
  device_id: string | null
}

function getTextValue(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key]
    if (value === null || value === undefined) continue
    const text = String(value).trim()
    if (text) return text
  }
  return null
}

function uniqueValues(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

function splitName(fullName: string | null): { firstName: string; lastName: string } {
  if (!fullName) {
    return { firstName: 'WHOOP', lastName: 'Participant' }
  }

  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) {
    return { firstName: 'WHOOP', lastName: 'Participant' }
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: 'Participant' }
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function workbookHasMissingParticipantIdentifiers(wb: ParsedWorkbook): boolean {
  return IMPORT_TABS.some((tab) =>
    (wb[tab] ?? []).some((row) => !getTextValue(row, [PARTICIPANT_IDENTIFIER_FIELD])),
  )
}

async function resolveWorkbookParticipantProfile(
  supabase: SupabaseClient,
  wb: ParsedWorkbook,
): Promise<WhoopParticipantProfile | null> {
  const condensedRows = wb[TAB_CONDENSED] ?? []
  if (!condensedRows.length) return null

  const identifiers = uniqueValues(
    condensedRows.map((row) => getTextValue(row, [PARTICIPANT_IDENTIFIER_FIELD])),
  )
  const names = uniqueValues(
    condensedRows.map((row) => getTextValue(row, ['Participant Name', 'Participant Name '])),
  )

  if (identifiers.length > 1 || names.length > 1) {
    return null
  }

  const fullName = names[0] ?? null
  const sourceIdentifier = identifiers[0] ?? null
  const department =
    condensedRows
      .map((row) => getTextValue(row, ['Department']))
      .find((value): value is string => Boolean(value)) ?? null

  let participantId: string | null = null

  if (fullName) {
    const { data: participants, error } = await supabase
      .from('participants')
      .select('id, first_name, last_name')

    if (error) throw error

    const normalizedTarget = normalizeName(fullName)
    const matches = (participants ?? []).filter((participant) =>
      normalizeName(`${participant.first_name} ${participant.last_name}`) === normalizedTarget,
    )

    if (matches.length === 1) {
      participantId = matches[0].id
    }
  }

  if (!participantId && sourceIdentifier) {
    participantId = sourceIdentifier
  }

  if (!participantId && fullName) {
    const slug = slugify(fullName)
    participantId = slug ? `whoop-${slug}` : null
  }

  if (!participantId) return null

  const { firstName, lastName } = splitName(fullName)

  return {
    participantId,
    sourceIdentifier,
    fullName,
    firstName,
    lastName,
    department,
  }
}

async function resolveParticipantProfileForAuthUser(
  supabase: SupabaseClient,
  authUserId: string,
): Promise<WhoopParticipantProfile | null> {
  const { data, error } = await supabase
    .from('participants')
    .select('id, auth_user_id, first_name, last_name, department, device_id')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const participant = data as ParticipantRow
  return {
    participantId: participant.id,
    sourceIdentifier: participant.device_id ?? participant.id,
    fullName: `${participant.first_name} ${participant.last_name}`.trim(),
    firstName: participant.first_name,
    lastName: participant.last_name,
    department: participant.department,
  }
}

function injectParticipantIdentifier(
  wb: ParsedWorkbook,
  participantId: string,
  overwriteExisting: boolean = false,
): ParsedWorkbook {
  const nextWorkbook: ParsedWorkbook = { ...wb }

  for (const tab of IMPORT_TABS) {
    if (!wb[tab]) continue

    nextWorkbook[tab] = wb[tab].map((row) => {
      const existingParticipantId = getTextValue(row, [PARTICIPANT_IDENTIFIER_FIELD])
      if (existingParticipantId && !overwriteExisting) return row
      return {
        ...row,
        [PARTICIPANT_IDENTIFIER_FIELD]: participantId,
      }
    })
  }

  return nextWorkbook
}

export async function prepareWhoopWorkbookForImport(
  supabase: SupabaseClient,
  wb: ParsedWorkbook,
  options?: string | PrepareWhoopWorkbookOptions | null,
): Promise<PreparedWhoopWorkbook> {
  const authUserId = typeof options === 'string' ? options : (options?.authUserId ?? null)
  const selectedParticipantProfile = typeof options === 'string' ? null : (options?.selectedParticipantProfile ?? null)

  if (selectedParticipantProfile) {
    return {
      workbook: injectParticipantIdentifier(wb, selectedParticipantProfile.participantId, true),
      participantProfiles: [selectedParticipantProfile],
    }
  }

  const authUserProfile = authUserId
    ? await resolveParticipantProfileForAuthUser(supabase, authUserId)
    : null
  const workbookProfile = await resolveWorkbookParticipantProfile(supabase, wb)
  const missingParticipantIdentifiers = workbookHasMissingParticipantIdentifiers(wb)
  const profile = authUserProfile ?? workbookProfile ?? null

  if (authUserId && !authUserProfile) {
    throw new Error('Your account is not linked to an participant record')
  }

  if (!profile) {
    if (missingParticipantIdentifiers) {
      throw new Error('Could not resolve participant identity from the Condensed Participant Metrics sheet')
    }

    return {
      workbook: wb,
      participantProfiles: [],
    }
  }

  return {
    workbook:
      authUserProfile
        ? injectParticipantIdentifier(wb, authUserProfile.participantId, true)
        : missingParticipantIdentifiers
          ? injectParticipantIdentifier(wb, profile.participantId)
          : wb,
    participantProfiles: [profile],
  }
}
