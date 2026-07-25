import { NextResponse } from 'next/server'
import { createServerSupabaseClient, getSession, getUserAccess } from '@/lib/supabase/server'
import { buildPulseSurveyUpsertRecord, validatePulseSubmissionPayload } from '@/lib/pulse-submission'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await getUserAccess(session.user.id)
  if (access.role !== 'participant') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const validation = validatePulseSubmissionPayload(body)
  if (!validation.ok || !validation.value) {
    return NextResponse.json({ error: validation.error ?? 'Invalid pulse payload.' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const { data: participantRecord, error: participantError } = await supabase
    .from('participants')
    .select('id')
    .eq('auth_user_id', session.user.id)
    .maybeSingle()

  if (participantError) {
    console.error('Pulse submit participant lookup failed', participantError)
    return NextResponse.json({ error: 'Unable to submit pulse survey right now.' }, { status: 500 })
  }

  if (!participantRecord) {
    return NextResponse.json({ error: 'Participant profile not linked to this account.' }, { status: 403 })
  }

  const date = new Date().toISOString().slice(0, 10)
  const upsertRecord = buildPulseSurveyUpsertRecord(participantRecord.id, date, validation.value)

  const { error: upsertError } = await supabase
    .from('pulse_surveys')
    .upsert(upsertRecord, { onConflict: 'participant_id,date' })

  if (upsertError) {
    console.error('Pulse submit upsert failed', upsertError)
    return NextResponse.json({ error: 'Unable to submit pulse survey right now.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, date })
}
