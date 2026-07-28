import { NextResponse } from 'next/server'
import { createServerSupabaseClient, requireAdmin } from '@/lib/supabase/server'

export const runtime = 'nodejs'

interface EventPayload {
  title?: string
  description?: string
  event_date?: string
  event_time?: string
  location?: string
  event_type?: string
  recurring?: boolean
  recurrence?: string | null
}

interface NudgePayload {
  message?: string
  author?: string
  week_of?: string
}

const VALID_EVENT_TYPES = new Set(['outdoor', 'fitness', 'race', 'general'])

function getMondayOfCurrentWeekIso(): string {
  const weekOf = new Date()
  weekOf.setDate(weekOf.getDate() - weekOf.getDay() + 1)
  return weekOf.toISOString().split('T')[0]
}

export async function GET() {
  const admin = await requireAdmin()
  if ('redirect' in admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createServerSupabaseClient()
  const today = new Date().toISOString().split('T')[0]

  const [{ data: events, error: eventsError }, { data: nudges, error: nudgesError }] = await Promise.all([
    supabase
      .from('events')
      .select('*')
      .gte('event_date', today)
      .order('event_date', { ascending: true }),
    supabase
      .from('weekly_nudges')
      .select('*')
      .order('week_of', { ascending: false })
      .limit(8),
  ])

  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 })
  }
  if (nudgesError) {
    return NextResponse.json({ error: nudgesError.message }, { status: 500 })
  }

  return NextResponse.json({ events: events ?? [], nudges: nudges ?? [] })
}

export async function POST(request: Request) {
  const admin = await requireAdmin()
  if ('redirect' in admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let payload: EventPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const title = (payload.title ?? '').trim()
  const eventDate = (payload.event_date ?? '').trim()
  const eventType = (payload.event_type ?? 'general').trim()
  if (!title || !eventDate) {
    return NextResponse.json({ error: 'Event title and date are required.' }, { status: 400 })
  }
  if (!VALID_EVENT_TYPES.has(eventType)) {
    return NextResponse.json({ error: 'Invalid event type.' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const { error } = await supabase
    .from('events')
    .insert({
      title,
      description: (payload.description ?? '').trim(),
      event_date: eventDate,
      event_time: (payload.event_time ?? '').trim(),
      location: (payload.location ?? '').trim(),
      event_type: eventType,
      recurring: Boolean(payload.recurring),
      recurrence: payload.recurring ? (payload.recurrence ?? '').trim() || null : null,
    })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function PUT(request: Request) {
  const admin = await requireAdmin()
  if ('redirect' in admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let payload: NudgePayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const message = (payload.message ?? '').trim()
  const author = (payload.author ?? '').trim() || 'VOILoop'
  const weekOf = (payload.week_of ?? '').trim() || getMondayOfCurrentWeekIso()
  if (!message) {
    return NextResponse.json({ error: 'Nudge message is required.' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const { error } = await supabase
    .from('weekly_nudges')
    .upsert({
      week_of: weekOf,
      message,
      author,
    }, { onConflict: 'week_of' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
