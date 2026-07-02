import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Session } from '@supabase/supabase-js'

export type AppRole = 'admin' | 'staff' | 'employee'

export interface UserAccess {
  role: AppRole | null
  mustChangePassword: boolean
}

export function createServerSupabaseClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set(name: string, value: string, options: any) {
          try { cookieStore.set({ name, value, ...options }) } catch {}
        },
        remove(name: string, options: any) {
          try { cookieStore.set({ name, value: '', ...options }) } catch {}
        },
      },
    }
  )
}

export async function getSession() {
  const supabase = createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getUserAccess(userId?: string): Promise<UserAccess> {
  const supabase = createServerSupabaseClient()
  if (userId) {
    const { data, error } = await supabase
      .from('user_access')
      .select('role, must_change_password')
      .eq('user_id', userId)
      .maybeSingle()

    if (!error && data) {
      return {
        role: (data.role as AppRole) ?? null,
        mustChangePassword: data.must_change_password ?? false,
      }
    }
  }

  const { data: legacyData } = await supabase
    .from('user_roles')
    .select('role')
    .single()

  return { role: (legacyData?.role as AppRole) ?? null, mustChangePassword: false }
}

export async function getUserRole(session?: Session | null): Promise<AppRole | null> {
  const resolvedSession = session ?? await getSession()
  if (!resolvedSession) return null
  const access = await getUserAccess(resolvedSession.user.id)
  return access.role
}

export async function requireAuth(allowedRoles?: AppRole[]) {
  const session = await getSession()
  if (!session) return { redirect: '/login' }
  const access = await getUserAccess(session.user.id)

  if (access.mustChangePassword) {
    return { redirect: '/change-password' }
  }

  if (allowedRoles) {
    if (!access.role || !allowedRoles.includes(access.role)) return { redirect: '/login' }
    return { session, role: access.role, mustChangePassword: access.mustChangePassword }
  }
  return {
    session,
    role: access.role,
    mustChangePassword: access.mustChangePassword,
  }
}

export async function requireAdmin() {
  const session = await getSession()
  if (!session) return { redirect: '/login' }
  const access = await getUserAccess(session.user.id)
  if (access.mustChangePassword) {
    return { redirect: '/change-password' }
  }
  if (access.role !== 'admin') return { redirect: '/executive' }
  return { session, role: access.role }
}

export async function isAdmin(userId: string): Promise<boolean> {
  const access = await getUserAccess(userId)
  if (access.role) return access.role === 'admin'

  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .single()
  return data?.role === 'admin'
}

export async function getRedirectByRole(userId: string): Promise<string> {
  const access = await getUserAccess(userId)
  if (!access.role || access.role === 'employee') return '/my'
  return '/executive'
}

export async function requireAuthenticatedSession() {
  const session = await getSession()
  if (!session) return { redirect: '/login' }
  return { session }
}

export async function getRoleAndSession() {
  const session = await getSession()
  if (!session) return { session: null, role: null, mustChangePassword: false }
  const access = await getUserAccess(session.user.id)
  return {
    session,
    role: access.role,
    mustChangePassword: access.mustChangePassword,
  }
}

export async function ensureRole(userId: string, role: AppRole) {
  const supabase = createServerSupabaseClient()
  const { error } = await supabase
    .from('user_access')
    .upsert({
      user_id: userId,
      role,
      must_change_password: false,
    }, { onConflict: 'user_id' })
  if (error) throw error
}

export async function clearMustChangePassword(userId: string) {
  const supabase = createServerSupabaseClient()
  const { error } = await supabase
    .from('user_access')
    .update({ must_change_password: false })
    .eq('user_id', userId)
  if (error) throw error
}

export async function setMustChangePassword(userId: string, mustChangePassword: boolean) {
  const supabase = createServerSupabaseClient()
  const access = await getUserAccess(userId)
  const { error } = await supabase
    .from('user_access')
    .upsert({
      user_id: userId,
      must_change_password: mustChangePassword,
      role: access.role ?? 'employee',
    }, { onConflict: 'user_id' })
  if (error) throw error
}

export async function requireAuthWithoutPasswordGate(allowedRoles?: AppRole[]) {
  const session = await getSession()
  if (!session) return { redirect: '/login' }
  const access = await getUserAccess(session.user.id)
  if (allowedRoles) {
    if (!access.role || !allowedRoles.includes(access.role)) return { redirect: '/login' }
    return { session, role: access.role, mustChangePassword: access.mustChangePassword }
  }
  return { session, role: access.role, mustChangePassword: access.mustChangePassword }
}
