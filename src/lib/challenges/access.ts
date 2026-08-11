import { NextResponse } from 'next/server'
import { getSession, getUserAccess } from '@/lib/supabase/server'

export function canOperateChallenges(role: string | null): boolean {
  return role === 'admin' || role === 'wellness_director'
}

function hasValidCronSecret(request: Request): boolean {
  const configuredSecret = process.env.CRON_SECRET?.trim()
  if (!configuredSecret) return false

  const authorization = request.headers.get('authorization') ?? ''
  const bearerPrefix = 'Bearer '
  if (!authorization.startsWith(bearerPrefix)) return false

  return authorization.slice(bearerPrefix.length).trim() === configuredSecret
}

export async function requireChallengeOperator(request?: Request) {
  if (request && hasValidCronSecret(request)) {
    return { userId: 'vercel-cron', role: 'admin' as const }
  }

  const session = await getSession()
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const access = await getUserAccess(session.user.id)
  if (!canOperateChallenges(access.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { userId: session.user.id, role: access.role }
}
