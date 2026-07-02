import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_ROUTES = ['/login']
const PASSWORD_CHANGE_ROUTE = '/change-password'
const ADMIN_ONLY = ['/admin']
// /admin/import is accessible to staff; list it before ADMIN_ONLY so it takes priority
const STAFF_ROUTES = ['/executive', '/team', '/pulse', '/interventions', '/outcomes', '/admin/import']

function isRouteMatch(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`)
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return request.cookies.get(name)?.value },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  const pathname = request.nextUrl.pathname

  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) {
    if (session && pathname === '/login') {
      return NextResponse.redirect(new URL('/executive', request.url))
    }
    return response
  }

  if (!session) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const { data: roleData } = await supabase
    .from('user_access')
    .select('role, must_change_password')
    .eq('user_id', session.user.id)
    .maybeSingle()

  let role = roleData?.role
  const mustChangePassword = roleData?.must_change_password ?? false

  if (!role) {
    const { data: legacyRoleData } = await supabase
      .from('user_roles')
      .select('role')
      .single()
    role = legacyRoleData?.role
  }

  if (mustChangePassword && !isRouteMatch(pathname, PASSWORD_CHANGE_ROUTE)) {
    return NextResponse.redirect(new URL(PASSWORD_CHANGE_ROUTE, request.url))
  }

  if (!mustChangePassword && isRouteMatch(pathname, PASSWORD_CHANGE_ROUTE)) {
    return NextResponse.redirect(new URL(role === 'employee' ? '/my' : '/executive', request.url))
  }

  // Check staff-accessible routes before admin-only routes so explicitly
  // whitelisted sub-paths (e.g. /admin/import) aren't blocked by the admin check.
  const isStaffRoute = STAFF_ROUTES.some((r) => isRouteMatch(pathname, r))
  const isAdminOnly = !isStaffRoute && ADMIN_ONLY.some((r) => isRouteMatch(pathname, r))

  if (isAdminOnly) {
    if (role !== 'admin') {
      return NextResponse.redirect(new URL('/executive', request.url))
    }
  }

  if (isStaffRoute) {
    if (!role || role === 'employee') {
      return NextResponse.redirect(new URL('/my', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
