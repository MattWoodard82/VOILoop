import { NextResponse } from 'next/server'
import { createServerSupabaseClient, requireAdmin } from '@/lib/supabase/server'

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

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('wellness_director_overrides')
    .upsert({
      participant_id: participantId,
      action,
      note,
      snooze_until: action === 'snooze' ? snoozeUntil : null,
      updated_by: admin.session.user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'participant_id' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ override: data })
}
