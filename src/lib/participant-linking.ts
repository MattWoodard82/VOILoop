import type { SupabaseClient } from '@supabase/supabase-js'

interface ParticipantRow {
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

  const first = parts[0] ?? 'user'
  const last = parts[1] ?? 'account'
  return {
    firstName: toTitleCase(first),
    lastName: toTitleCase(last),
  }
}

function buildGeneratedParticipantId(userId: string): string {
  const compact = userId.replace(/-/g, '')
  return `USR${compact.slice(0, 10).toUpperCase()}`
}

export async function ensureParticipantForAuthUser(
  supabase: SupabaseClient,
  userId: string,
  email: string,
): Promise<string> {
  const { data: current, error: currentError } = await supabase
    .from('participants')
    .select('id')
    .eq('auth_user_id', userId)
    .maybeSingle()

  if (currentError) throw currentError
  if (current?.id) return current.id

  const { firstName, lastName } = deriveNamesFromEmail(email)
  const normalizedFirst = normalizeNameToken(firstName)
  const normalizedLast = normalizeNameToken(lastName)

  const { data: candidates, error: candidatesError } = await supabase
    .from('participants')
    .select('id, first_name, last_name, auth_user_id')
    .is('auth_user_id', null)

  if (candidatesError) throw candidatesError

  const matched = (candidates as ParticipantRow[] | null)?.find((participant) =>
    normalizeNameToken(participant.first_name) === normalizedFirst &&
    normalizeNameToken(participant.last_name) === normalizedLast
  )

  if (matched?.id) {
    const { error: updateError } = await supabase
      .from('participants')
      .update({ auth_user_id: userId })
      .eq('id', matched.id)

    if (updateError) throw updateError
    return matched.id
  }

  let participantId = buildGeneratedParticipantId(userId)
  const today = new Date().toISOString().slice(0, 10)

  const { data: existingId } = await supabase
    .from('participants')
    .select('id')
    .eq('id', participantId)
    .maybeSingle()

  if (existingId?.id) {
    participantId = `${participantId}_${Math.floor(Math.random() * 900 + 100)}`
  }

  const { error: insertError } = await supabase
    .from('participants')
    .insert({
      id: participantId,
      auth_user_id: userId,
      first_name: firstName,
      last_name: lastName,
      department: 'Unassigned',
      title: 'Participant',
      consent: true,
      enrolled_date: today,
      status: 'Active',
      is_exact_data: false,
    })

  if (insertError) throw insertError
  return participantId
}
