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
const EMPLOYEE_IDENTIFIER_FIELD = 'Employee Identifier'

export interface WhoopEmployeeProfile {
  employeeId: string
  sourceIdentifier: string | null
  fullName: string | null
  firstName: string
  lastName: string
  department: string | null
}

export interface PreparedWhoopWorkbook {
  workbook: ParsedWorkbook
  employeeProfiles: WhoopEmployeeProfile[]
}

export interface PrepareWhoopWorkbookOptions {
  authUserId?: string | null
  selectedEmployeeProfile?: WhoopEmployeeProfile | null
}

interface EmployeeRow {
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

function workbookHasMissingEmployeeIdentifiers(wb: ParsedWorkbook): boolean {
  return IMPORT_TABS.some((tab) =>
    (wb[tab] ?? []).some((row) => !getTextValue(row, [EMPLOYEE_IDENTIFIER_FIELD])),
  )
}

async function resolveWorkbookEmployeeProfile(
  supabase: SupabaseClient,
  wb: ParsedWorkbook,
): Promise<WhoopEmployeeProfile | null> {
  const condensedRows = wb[TAB_CONDENSED] ?? []
  if (!condensedRows.length) return null

  const identifiers = uniqueValues(
    condensedRows.map((row) => getTextValue(row, [EMPLOYEE_IDENTIFIER_FIELD])),
  )
  const names = uniqueValues(
    condensedRows.map((row) => getTextValue(row, ['Employee Name', 'Employee Name '])),
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

  let employeeId: string | null = null

  if (fullName) {
    const { data: employees, error } = await supabase
      .from('employees')
      .select('id, first_name, last_name')

    if (error) throw error

    const normalizedTarget = normalizeName(fullName)
    const matches = (employees ?? []).filter((employee) =>
      normalizeName(`${employee.first_name} ${employee.last_name}`) === normalizedTarget,
    )

    if (matches.length === 1) {
      employeeId = matches[0].id
    }
  }

  if (!employeeId && sourceIdentifier) {
    employeeId = sourceIdentifier
  }

  if (!employeeId && fullName) {
    const slug = slugify(fullName)
    employeeId = slug ? `whoop-${slug}` : null
  }

  if (!employeeId) return null

  const { firstName, lastName } = splitName(fullName)

  return {
    employeeId,
    sourceIdentifier,
    fullName,
    firstName,
    lastName,
    department,
  }
}

async function resolveEmployeeProfileForAuthUser(
  supabase: SupabaseClient,
  authUserId: string,
): Promise<WhoopEmployeeProfile | null> {
  const { data, error } = await supabase
    .from('employees')
    .select('id, auth_user_id, first_name, last_name, department, device_id')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const employee = data as EmployeeRow
  return {
    employeeId: employee.id,
    sourceIdentifier: employee.device_id ?? employee.id,
    fullName: `${employee.first_name} ${employee.last_name}`.trim(),
    firstName: employee.first_name,
    lastName: employee.last_name,
    department: employee.department,
  }
}

function injectEmployeeIdentifier(
  wb: ParsedWorkbook,
  employeeId: string,
  overwriteExisting: boolean = false,
): ParsedWorkbook {
  const nextWorkbook: ParsedWorkbook = { ...wb }

  for (const tab of IMPORT_TABS) {
    if (!wb[tab]) continue

    nextWorkbook[tab] = wb[tab].map((row) => {
      const existingEmployeeId = getTextValue(row, [EMPLOYEE_IDENTIFIER_FIELD])
      if (existingEmployeeId && !overwriteExisting) return row
      return {
        ...row,
        [EMPLOYEE_IDENTIFIER_FIELD]: employeeId,
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
  const selectedEmployeeProfile = typeof options === 'string' ? null : (options?.selectedEmployeeProfile ?? null)

  if (selectedEmployeeProfile) {
    return {
      workbook: injectEmployeeIdentifier(wb, selectedEmployeeProfile.employeeId, true),
      employeeProfiles: [selectedEmployeeProfile],
    }
  }

  const authUserProfile = authUserId
    ? await resolveEmployeeProfileForAuthUser(supabase, authUserId)
    : null
  const workbookProfile = await resolveWorkbookEmployeeProfile(supabase, wb)
  const missingEmployeeIdentifiers = workbookHasMissingEmployeeIdentifiers(wb)
  const profile = authUserProfile ?? workbookProfile ?? null

  if (authUserId && !authUserProfile) {
    throw new Error('Your account is not linked to an employee record')
  }

  if (!profile) {
    if (missingEmployeeIdentifiers) {
      throw new Error('Could not resolve employee identity from the Condensed Employee Metrics sheet')
    }

    return {
      workbook: wb,
      employeeProfiles: [],
    }
  }

  return {
    workbook:
      authUserProfile
        ? injectEmployeeIdentifier(wb, authUserProfile.employeeId, true)
        : missingEmployeeIdentifiers
          ? injectEmployeeIdentifier(wb, profile.employeeId)
          : wb,
    employeeProfiles: [profile],
  }
}
