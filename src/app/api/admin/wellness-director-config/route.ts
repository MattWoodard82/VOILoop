import { NextResponse } from 'next/server'
import { createServerSupabaseClient, requireAdmin } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const DEFAULT_WEIGHTS = {
  recovery: 35,
  hrv: 15,
  sleep: 25,
  debt: 25,
}

export async function GET() {
  const admin = await requireAdmin()
  if ('redirect' in admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('wellness_director_config')
    .select('*')
    .eq('id', 'current')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ config: data ?? { id: 'current', weights: DEFAULT_WEIGHTS } })
}

export async function PUT(request: Request) {
  const admin = await requireAdmin()
  if ('redirect' in admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const weights = body?.weights
  const recovery = Number(weights?.recovery)
  const hrv = Number(weights?.hrv)
  const sleep = Number(weights?.sleep)
  const debt = Number(weights?.debt)

  if (![recovery, hrv, sleep, debt].every((value) => Number.isFinite(value))) {
    return NextResponse.json({ error: 'Invalid weights' }, { status: 400 })
  }

  const total = recovery + hrv + sleep + debt
  if (total !== 100) {
    return NextResponse.json({ error: 'Weights must sum to 100' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('wellness_director_config')
    .upsert({
      id: 'current',
      weights: { recovery, hrv, sleep, debt },
    }, { onConflict: 'id' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ config: data })
}
