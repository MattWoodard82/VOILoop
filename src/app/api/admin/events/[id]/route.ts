import { NextResponse } from 'next/server'
import { createServerSupabaseClient, requireLeadership } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const leadership = await requireLeadership()
  if ('redirect' in leadership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const eventId = (params.id ?? '').trim()
  if (!eventId) {
    return NextResponse.json({ error: 'Event id is required.' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const kind = new URL(request.url).searchParams.get('kind')
  if (kind === 'nudge') {
    return NextResponse.json(
      { error: 'Published nudges are append-only and cannot be deleted.' },
      { status: 405 }
    )
  }

  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
