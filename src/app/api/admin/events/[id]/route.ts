import { NextResponse } from 'next/server'
import { createServerSupabaseClient, requireAdmin } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin()
  if ('redirect' in admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const eventId = (params.id ?? '').trim()
  if (!eventId) {
    return NextResponse.json({ error: 'Event id is required.' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
