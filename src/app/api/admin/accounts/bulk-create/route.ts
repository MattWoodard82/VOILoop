import { NextResponse } from 'next/server'
import { createServerSupabaseClient, getSession } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

interface ParsedCsv {
  emails: string[]
  invalidRows: string[]
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
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

async function requireAdminUser(userId: string): Promise<boolean> {
  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('user_access')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()

  if (data?.role) return data.role === 'admin'

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

  if (!file.name.toLowerCase().endsWith('.csv')) {
    return NextResponse.json({ error: 'Only .csv files are supported.' }, { status: 400 })
  }

  const csvContent = await file.text()
  const parsed = parseEmailCsv(csvContent)
  if (!parsed.emails.length && !parsed.invalidRows.length) {
    return NextResponse.json({ error: 'No rows found in CSV.' }, { status: 400 })
  }

  const adminClient = createAdminSupabaseClient()

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

  const outputRows: Array<{ email: string; password: string; status: string }> = []

  for (const email of parsed.invalidRows) {
    outputRows.push({ email, password: '', status: 'invalid-email' })
  }

  for (const email of parsed.emails) {
    const password = randomPassword(8)
    let userId = existingUsersByEmail.get(email)
    let status = 'created'

    if (userId) {
      status = 'updated'
      const { error } = await adminClient.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      })
      if (error) {
        outputRows.push({ email, password: '', status: `error:${error.message}` })
        continue
      }
    } else {
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (error || !data.user?.id) {
        outputRows.push({ email, password: '', status: `error:${error?.message ?? 'Failed to create user'}` })
        continue
      }
      userId = data.user.id
      existingUsersByEmail.set(email, userId)
    }

    const { error: accessError } = await adminClient
      .from('user_access')
      .upsert({
        user_id: userId,
        role: 'employee',
        must_change_password: true,
      }, { onConflict: 'user_id' })

    if (accessError) {
      outputRows.push({ email, password: '', status: `error:${accessError.message}` })
      continue
    }

    outputRows.push({ email, password, status })
  }

  const outputCsv = [
    'email,password,status',
    ...outputRows.map((row) => [csvEscape(row.email), csvEscape(row.password), csvEscape(row.status)].join(',')),
  ].join('\n')

  return new NextResponse(outputCsv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="pilot-user-passwords.csv"',
    },
  })
}
