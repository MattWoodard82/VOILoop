import { NextResponse } from 'next/server'
import { createServerSupabaseClient, getSession } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { provisionSupabaseAccount } from '@/lib/supabase/provision-account'
import { randomInt } from 'crypto'

export const runtime = 'nodejs'

type AccountType = 'employee' | 'wellness_director'

interface ParsedCsv {
  emails: string[]
  invalidRows: string[]
}

interface EmployeeRecord {
  id: string
  auth_user_id: string | null
}

interface ProvisioningConfig {
  role: AccountType
  downloadFileName: string
  createsEmployeeRecord: boolean
}

const ACCOUNT_TYPE_CONFIG: Record<AccountType, ProvisioningConfig> = {
  employee: {
    role: 'employee',
    downloadFileName: 'employee-passwords.csv',
    createsEmployeeRecord: true,
  },
  wellness_director: {
    role: 'wellness_director',
    downloadFileName: 'wellness-director-passwords.csv',
    createsEmployeeRecord: false,
  },
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      i++
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === ',' && !inQuotes) {
      cells.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  cells.push(current.trim())
  return cells
}

function parseEmailCsv(content: string): ParsedCsv {
  const rows = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (!rows.length) {
    return { emails: [], invalidRows: [] }
  }

  const firstRowCells = parseCsvLine(rows[0]).map((cell) => cell.toLowerCase())
  const emailColumnIndex = firstRowCells.findIndex((cell) => cell === 'email' || cell === 'email_address')
  const startIndex = emailColumnIndex >= 0 ? 1 : 0
  const targetIndex = emailColumnIndex >= 0 ? emailColumnIndex : 0

  const emails: string[] = []
  const invalidRows: string[] = []
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  for (let i = startIndex; i < rows.length; i++) {
    const cells = parseCsvLine(rows[i])
    const raw = (cells[targetIndex] ?? '').trim().toLowerCase()
    if (!raw) continue

    if (!emailRegex.test(raw)) {
      invalidRows.push(raw)
      continue
    }

    emails.push(raw)
  }

  return { emails: Array.from(new Set(emails)), invalidRows }
}

function randomPassword(length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars[randomInt(chars.length)]
  }
  return result
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ')
}

function deriveNameFromEmail(email: string): { firstName: string; lastName: string } {
  const localPart = email.split('@')[0] ?? ''
  const parts = localPart
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(toTitleCase)

  if (parts.length === 0) {
    return { firstName: 'Pilot', lastName: 'User' }
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: 'User' }
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

function getNextEmployeeNumber(existingEmployees: EmployeeRecord[]): number {
  const maxEmployeeNumber = existingEmployees.reduce((max, employee) => {
    const match = /^EMP(\d+)$/i.exec(employee.id)
    if (!match) return max
    return Math.max(max, Number(match[1]))
  }, 0)

  return maxEmployeeNumber + 1
}

function formatEmployeeId(employeeNumber: number): string {
  return `EMP${String(employeeNumber).padStart(3, '0')}`
}

function parseAccountType(value: FormDataEntryValue | null): AccountType | null {
  if (value !== 'employee' && value !== 'wellness_director') {
    return null
  }

  return value
}

async function ensureEmployeeRecord(
  adminClient: ReturnType<typeof createAdminSupabaseClient>,
  existingEmployeesByAuthUserId: Map<string, EmployeeRecord>,
  nextEmployeeNumberRef: { current: number },
  userId: string,
  email: string,
): Promise<string> {
  const existingEmployee = existingEmployeesByAuthUserId.get(userId)
  if (existingEmployee) {
    return existingEmployee.id
  }

  const employeeId = formatEmployeeId(nextEmployeeNumberRef.current)
  nextEmployeeNumberRef.current += 1

  const { firstName, lastName } = deriveNameFromEmail(email)
  const today = new Date().toISOString().slice(0, 10)

  const { error } = await adminClient
    .from('employees')
    .insert({
      id: employeeId,
      auth_user_id: userId,
      first_name: firstName,
      last_name: lastName,
      department: 'Pilot',
      title: 'Pilot Participant',
      device_id: null,
      consent: true,
      enrolled_date: today,
      status: 'Active',
      is_exact_data: false,
    })

  if (error) {
    throw error
  }

  const employeeRecord = { id: employeeId, auth_user_id: userId }
  existingEmployeesByAuthUserId.set(userId, employeeRecord)
  return employeeId
}

async function requireAdminUser(userId: string): Promise<boolean> {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('user_access')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()

  if (data?.role) return data.role === 'admin'
  if (!error) return false

  if (!isMissingUserAccessTable(error)) {
    throw error
  }

  const { data: legacyData } = await supabase
    .from('user_roles')
    .select('role')
    .single()

  return legacyData?.role === 'admin'
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isAdmin = await requireAdminUser(session.user.id)
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request body'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'CSV file is required.' }, { status: 400 })
  }

  const accountType = parseAccountType(formData.get('accountType'))
  if (!accountType) {
    return NextResponse.json({ error: 'A valid account type is required.' }, { status: 400 })
  }

  if (!file.name.toLowerCase().endsWith('.csv')) {
    return NextResponse.json({ error: 'Only .csv files are supported.' }, { status: 400 })
  }

  const csvContent = await file.text()
  const parsed = parseEmailCsv(csvContent)
  if (!parsed.emails.length && !parsed.invalidRows.length) {
    return NextResponse.json({ error: 'No rows found in CSV.' }, { status: 400 })
  }

  const adminClient = createAdminSupabaseClient()
  const config = ACCOUNT_TYPE_CONFIG[accountType]
  let existingEmployees: EmployeeRecord[] = []

  if (config.createsEmployeeRecord) {
    const { data, error: employeesError } = await adminClient
      .from('employees')
      .select('id, auth_user_id')

    if (employeesError) {
      return NextResponse.json({ error: employeesError.message }, { status: 500 })
    }

    existingEmployees = (data ?? []) as EmployeeRecord[]
  }

  const existingEmployeesByAuthUserId = new Map<string, EmployeeRecord>()
  for (const employee of existingEmployees) {
    if (employee.auth_user_id) {
      existingEmployeesByAuthUserId.set(employee.auth_user_id, employee)
    }
  }
  const nextEmployeeNumberRef = { current: getNextEmployeeNumber(existingEmployees) }

  const existingUsersByEmail = new Map<string, string>()
  let page = 1
  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const users = data.users ?? []
    for (const user of users) {
      if (user.email) existingUsersByEmail.set(user.email.toLowerCase(), user.id)
    }
    if (users.length < 1000) break
    page++
  }

  const outputRows: Array<{ email: string; accountType: AccountType; employeeId: string; password: string; status: string }> = []

  for (const email of parsed.invalidRows) {
    outputRows.push({ email, accountType, employeeId: '', password: '', status: 'invalid-email' })
  }

  for (const email of parsed.emails) {
    const password = randomPassword(8)
    let userId = existingUsersByEmail.get(email)
    let employeeId = ''
    let status: 'created' | 'updated' = 'created'

    try {
      const provisioned = await provisionSupabaseAccount({
        adminClient,
        email,
        password,
        role: config.role,
        mustChangePassword: true,
        existingUserId: userId,
      })
      userId = provisioned.userId
      status = provisioned.status
      existingUsersByEmail.set(email, userId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create user'
      outputRows.push({ email, accountType, employeeId: '', password, status: `error:${message}` })
      continue
    }

    if (config.createsEmployeeRecord) {
      try {
        employeeId = await ensureEmployeeRecord(
          adminClient,
          existingEmployeesByAuthUserId,
          nextEmployeeNumberRef,
          userId,
          email,
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create employee record'
        outputRows.push({ email, accountType, employeeId: '', password, status: `error:${message}` })
        continue
      }
    }

    outputRows.push({ email, accountType, employeeId, password, status })
  }

  const outputCsv = [
    'email,account_type,employee_id,password,status',
    ...outputRows.map((row) => [csvEscape(row.email), csvEscape(row.accountType), csvEscape(row.employeeId), csvEscape(row.password), csvEscape(row.status)].join(',')),
  ].join('\n')

  return new NextResponse(outputCsv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${config.downloadFileName}"`,
    },
  })
}
function isMissingUserAccessTable(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false
  const message = (error.message ?? '').toLowerCase()
  return error.code === 'PGRST205' || message.includes('user_access')
}
