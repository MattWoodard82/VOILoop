import type { SupabaseClient } from '@supabase/supabase-js'

interface EmployeeRow {
  id: string
  first_name: string
  last_name: string
  auth_user_id: string | null
}

function normalizeNameToken(token: string): string {
  return token
    .replace(/[^a-z]/gi, '')
    .toLowerCase()
}

function toTitleCase(token: string): string {
  if (!token) return 'User'
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
}

function deriveNamesFromEmail(email: string): { firstName: string; lastName: string } {
  const local = email.split('@')[0] ?? ''
  const parts = local
    .split(/[._-]+/)
    .map(normalizeNameToken)
    .filter(Boolean)

  const first = parts[0] ?? 'pilot'
  const last = parts[1] ?? 'user'
  return {
    firstName: toTitleCase(first),
    lastName: toTitleCase(last),
  }
}

function buildGeneratedEmployeeId(userId: string): string {
  const compact = userId.replace(/-/g, '')
  return `USR${compact.slice(0, 10).toUpperCase()}`
}

export async function ensureEmployeeForAuthUser(
  supabase: SupabaseClient,
  userId: string,
  email: string,
): Promise<string> {
  const { data: current, error: currentError } = await supabase
    .from('employees')
    .select('id')
    .eq('auth_user_id', userId)
    .maybeSingle()

  if (currentError) throw currentError
  if (current?.id) return current.id

  const { firstName, lastName } = deriveNamesFromEmail(email)
  const normalizedFirst = normalizeNameToken(firstName)
  const normalizedLast = normalizeNameToken(lastName)

  const { data: candidates, error: candidatesError } = await supabase
    .from('employees')
    .select('id, first_name, last_name, auth_user_id')
    .is('auth_user_id', null)

  if (candidatesError) throw candidatesError

  const matched = (candidates as EmployeeRow[] | null)?.find((employee) =>
    normalizeNameToken(employee.first_name) === normalizedFirst &&
    normalizeNameToken(employee.last_name) === normalizedLast
  )

  if (matched?.id) {
    const { error: updateError } = await supabase
      .from('employees')
      .update({ auth_user_id: userId })
      .eq('id', matched.id)

    if (updateError) throw updateError
    return matched.id
  }

  let employeeId = buildGeneratedEmployeeId(userId)
  const today = new Date().toISOString().slice(0, 10)

  const { data: existingId } = await supabase
    .from('employees')
    .select('id')
    .eq('id', employeeId)
    .maybeSingle()

  if (existingId?.id) {
    employeeId = `${employeeId}_${Math.floor(Math.random() * 900 + 100)}`
  }

  const { error: insertError } = await supabase
    .from('employees')
    .insert({
      id: employeeId,
      auth_user_id: userId,
      first_name: firstName,
      last_name: lastName,
      department: 'Unassigned',
      title: 'Employee',
      consent: true,
      enrolled_date: today,
      status: 'Active',
      is_exact_data: false,
    })

  if (insertError) throw insertError
  return employeeId
}
