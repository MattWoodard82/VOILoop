import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_ROUTES = ['/login']
const ADMIN_ONLY = ['/admin']
const STAFF_ROUTES = ['/executive', '/team', '/pulse', '/interventions', '/outcomes']

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
    .from('user_roles')
    .select('role')
    .single()

  const role = roleData?.role

  if (ADMIN_ONLY.some(r => pathname.startsWith(r))) {
    if (role !== 'admin') {
      return NextResponse.redirect(new URL('/executive', request.url))
    }
  }

  if (STAFF_ROUTES.some(r => pathname.startsWith(r))) {
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
