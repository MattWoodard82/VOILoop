import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

type OverrideAction = 'snooze' | 'dismiss'

export async function POST(request: Request) {
  const admin = await requireAdmin()
  if ('redirect' in admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const participantId = String(body?.participant_id ?? '').trim()
  const action = String(body?.action ?? '').trim() as OverrideAction
  const note = body?.note == null ? null : String(body.note).trim() || null
  const snoozeUntil = body?.snooze_until == null ? null : String(body.snooze_until).trim() || null

  if (!participantId || !['snooze', 'dismiss'].includes(action)) {
    return NextResponse.json({ error: 'Invalid override payload' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()
  const { data: existingFlag, error: existingFlagError } = await supabase
    .from('risk_flags')
    .select('id')
    .eq('participant_id', participantId)
    .eq('flag_type', 'wellness_director')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingFlagError) {
    return NextResponse.json({ error: existingFlagError.message }, { status: 500 })
  }

  const overridePayload = {
    participant_id: participantId,
    flag_type: 'wellness_director',
    is_active: true,
    severity: null,
    override_state: action === 'snooze' ? 'snoozed' : 'dismissed',
    override_reason: note,
    override_expires_at: action === 'snooze' ? snoozeUntil : null,
    updated_at: new Date().toISOString(),
  }

  const target = existingFlag
    ? supabase.from('risk_flags').update(overridePayload).eq('id', existingFlag.id)
    : supabase.from('risk_flags').insert(overridePayload)

  const { data, error } = await target
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ override: data })
}
