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
  target_type?: 'all' | 'subgroup' | 'participant'
  target_label?: string
  participant_id?: string
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
  const targetType = payload.target_type ?? 'all'
  const targetLabel = (payload.target_label ?? '').trim()
  const participantId = (payload.participant_id ?? '').trim()
  if (!message) {
    return NextResponse.json({ error: 'Nudge message is required.' }, { status: 400 })
  }
  if (!['all', 'subgroup', 'participant'].includes(targetType)) {
    return NextResponse.json({ error: 'Invalid target type.' }, { status: 400 })
  }
  if (targetType === 'subgroup' && !targetLabel) {
    return NextResponse.json({ error: 'Target label is required for subgroup nudges.' }, { status: 400 })
  }
  if (targetType === 'participant' && !participantId) {
    return NextResponse.json({ error: 'Participant id is required for individual nudges.' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  
  // Delete old targets for this nudge (republishing clears old targeting)
  // Then persist new nudge + target atomically via RPC
  const { data: result, error: rpcError } = await supabase.rpc('upsert_nudge_with_engagement_target', {
    p_week_of: weekOf,
    p_message: message,
    p_author: author,
    p_target_type: targetType,
    p_target_label: targetLabel || '',
    p_participant_id: targetType === 'participant' ? participantId : null,
  })

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 })
  }
  if (!result?.nudge_id) {
    return NextResponse.json({ error: 'Failed to persist nudge and target.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, nudge_id: result.nudge_id })
}
