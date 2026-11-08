import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/supabase/server'
import { refreshDemoStory } from '@/lib/demo-story-refresh'
import { DEMO_REFRESH_CONFIRMATION } from '@/lib/demo-story'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const admin = await requireAdmin()
  if ('redirect' in admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  const protocol = request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.slice(0, -1)
  let sameOrigin = false
  if (origin && host) {
    try {
      const parsed = new URL(origin)
      sameOrigin = parsed.origin === origin && parsed.host === host && parsed.protocol === `${protocol}:`
    } catch {
      sameOrigin = false
    }
  }
  if (!sameOrigin) {
    return NextResponse.json({ error: 'Refresh must be requested from this app.' }, { status: 403 })
  }
  const body = await request.json().catch(() => null)
  if (body?.confirmation !== DEMO_REFRESH_CONFIRMATION) {
    return NextResponse.json({ error: 'Confirm the demo data refresh before continuing.' }, { status: 400 })
  }
  try {
    const result = await refreshDemoStory()
    for (const path of ['/admin', '/pulse', '/outcomes', '/wellness-director', '/team', '/my']) revalidatePath(path)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Demo story refresh failed:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Demo refresh failed. No success was confirmed.' }, { status: 500 })
  }
}
