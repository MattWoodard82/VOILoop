import { NextResponse } from 'next/server'
import { createServerSupabaseClient, getSession, getUserAccess } from '@/lib/supabase/server'
import type { InterventionStatus } from '@/types'

export const runtime = 'nodejs'

const VALID_STATUSES = new Set<InterventionStatus>(['Pending', 'In Progress', 'Monitoring', 'Resolved'])
const ACTIONED_STATUSES = new Set<InterventionStatus>(['In Progress', 'Monitoring', 'Resolved'])

interface InterventionUpdatePayload {
  status?: string
  notes?: string
  wdNotes?: string
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await getUserAccess(session.user.id)
  if (access.role !== 'admin' && access.role !== 'wellness_director') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const interventionId = (params.id ?? '').trim()
  if (!interventionId) {
    return NextResponse.json({ error: 'Intervention id is required.' }, { status: 400 })
  }

  let payload: InterventionUpdatePayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const status = (payload.status ?? '').trim() as InterventionStatus
  if (!VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Invalid intervention status.' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  // Fetch the existing record to preserve date_actioned across updates
  const { data: existing, error: fetchError } = await supabase
    .from('interventions')
    .select('date_actioned')
    .eq('id', interventionId)
    .maybeSingle()

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const today = new Date().toISOString().split('T')[0]
  const existingDateActioned = existing?.date_actioned ?? null
  const shouldSetDateActioned = existingDateActioned === null && ACTIONED_STATUSES.has(status)
  const updateRecord = {
    outcome: status,
    notes: payload.notes ?? null,
    wd_notes: payload.wdNotes ?? null,
    date_actioned: shouldSetDateActioned ? today : existingDateActioned,
    date_resolved: status === 'Resolved' ? today : null,
  }

  const { error } = await supabase
    .from('interventions')
    .update(updateRecord)
    .eq('id', interventionId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
