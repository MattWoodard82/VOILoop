import { NextResponse } from 'next/server'
import { getSession, getUserAccess } from '@/lib/supabase/server'

export function canOperateInterventions(role: string | null): boolean {
  return role === 'admin' || role === 'wellness_director'
}

export async function requireInterventionOperator() {
  const session = await getSession()
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const access = await getUserAccess(session.user.id)
  if (!canOperateInterventions(access.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { userId: session.user.id, role: access.role }
}
