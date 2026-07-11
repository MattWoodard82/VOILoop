'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Activity, BarChart2, MessageSquare, Target, TrendingUp, Upload, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

type NavRole = 'admin' | 'wellness_director' | 'employee' | null

const LEADERSHIP_NAV = [
  { label: 'Dashboards', items: [
    { href: '/wellness-director', label: 'Wellness Director', icon: BarChart2 },
    { href: '/team', label: 'Team Roster', icon: Users },
    { href: '/pulse', label: 'Pulse Surveys', icon: MessageSquare },
  ]},
  { label: 'Programs', items: [
    { href: '/interventions', label: 'Interventions', icon: Target },
    { href: '/outcomes', label: 'Outcomes', icon: TrendingUp },
  ]},
]

const ADMIN_NAV = [
  ...LEADERSHIP_NAV,
  { label: 'Admin', items: [
    { href: '/admin/accounts', label: 'Account Provisioning', icon: Users },
  ]},
]

const EMPLOYEE_NAV = [
  { label: 'My Dashboard', items: [
    { href: '/my', label: 'My Wellness', icon: Activity },
    { href: '/admin/import', label: 'Import WHOOP Data', icon: Upload },
  ]},
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<NavRole>(null)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    let mounted = true

    async function loadUser() {
      const supabase = createClient()
      const { data, error } = await supabase.auth.getUser()
      if (!mounted || error) return
      setEmail(data.user?.email ?? '')

      if (!data.user?.id) return

      const { data: access } = await supabase
        .from('user_access')
        .select('role')
        .eq('user_id', data.user.id)
        .maybeSingle()

      if (mounted) {
        setRole((access?.role as NavRole | undefined) ?? null)
      }
    }

    void loadUser()

    return () => {
      mounted = false
    }
  }, [])

  const initials = useMemo(() => {
    const source = email.trim()
    if (!source) return 'U'
    return source.slice(0, 2).toUpperCase()
  }, [email])

  const nav = useMemo(() => {
    if (role === 'admin') return ADMIN_NAV
    if (role === 'wellness_director') return LEADERSHIP_NAV
    if (role === 'employee') return EMPLOYEE_NAV
    return pathname.startsWith('/my') ? EMPLOYEE_NAV : LEADERSHIP_NAV
  }, [pathname, role])

  const handleSignOut = async () => {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-[220px] min-w-[220px] flex flex-col"
      style={{ background: '#002244', borderRight: '1px solid #0a3560' }}>

      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5"
        style={{ borderBottom: '1px solid #0a3560' }}>
        <LoopMark />
        <div>
          <div>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#69BE28', letterSpacing: '-0.3px' }}>VOI</span>
            <span style={{ fontWeight: 300, fontSize: 15, color: '#fff', letterSpacing: '-0.3px' }}>Loop</span>
          </div>
          <div style={{ fontSize: 9, color: '#A5ACAF', letterSpacing: '0.07em', textTransform: 'uppercase', marginTop: 2 }}>
            Outcomes Platform
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2">
        {nav.map((section) => (
          <div key={section.label}>
            <div style={{ fontSize: 9, color: '#A5ACAF', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '10px 8px 4px', fontWeight: 600 }}>
              {section.label}
            </div>
            {section.items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link key={href} href={href}
                  className={cn('nav-item', active && 'active')}>
                  <Icon size={15} />
                  {label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3"
        style={{ borderTop: '1px solid #0a3560' }}>
        <div className="flex items-center gap-2">
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#69BE28', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#002244', flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {email || 'Signed in'}
            </div>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          style={{ marginTop: 10, width: '100%', background: 'transparent', border: '1px solid #0a3560', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#A5ACAF', cursor: signingOut ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}
        >
          {signingOut ? 'Signing out...' : 'Sign out'}
        </button>
      </div>
    </aside>
  )
}

function LoopMark() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <circle cx="18" cy="18" r="14" stroke="#0a3560" strokeWidth="2.5"/>
      <path d="M18,4 A14,14 0 0,1 31,21" stroke="#69BE28" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M31,21 A14,14 0 0,1 18,32" stroke="#69BE28" strokeWidth="1.8" strokeLinecap="round" opacity="0.65"/>
      <path d="M18,32 A14,14 0 0,1 5,21" stroke="#69BE28" strokeWidth="1.8" strokeLinecap="round" opacity="0.4"/>
      <path d="M5,18 A14,14 0 0,1 16,4" stroke="#69BE28" strokeWidth="1.8" strokeLinecap="round" opacity="0.2"/>
      <path d="M27 18 L32 22 L27 27" stroke="#69BE28" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <circle cx="18" cy="4" r="2.5" fill="#69BE28"/>
      <circle cx="32" cy="18" r="2.5" fill="#69BE28"/>
      <circle cx="18" cy="32" r="2.5" fill="#69BE28"/>
      <circle cx="4" cy="18" r="2.5" fill="#69BE28"/>
      <circle cx="18" cy="18" r="6" fill="#001a33"/>
      <text x="18" y="19.5" textAnchor="middle" fontFamily="Inter,sans-serif" fontWeight="700" fontSize="5" fill="#69BE28">VOI</text>
    </svg>
  )
}
