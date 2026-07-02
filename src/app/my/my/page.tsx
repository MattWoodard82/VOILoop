import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MyDashboardClient } from './MyDashboardClient'
import { SignOutButton } from '@/components/auth/SignOutButton'

export const dynamic = 'force-dynamic'

export default async function MyPage() {
  const supabase = createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: employee } = await supabase
    .from('employees').select('*').eq('auth_user_id', session.user.id).single()

  if (!employee) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d1f35', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ background: '#002244', border: '1px solid #0a3560', borderRadius: 12, padding: 36, maxWidth: 400, textAlign: 'center', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 16, right: 16 }}>
            <SignOutButton />
          </div>
          <div style={{ fontSize: 32, marginBottom: 12 }}>👋</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Account not linked yet</h2>
          <p style={{ fontSize: 13, color: '#A5ACAF', lineHeight: 1.6 }}>Your login is set up but has not been linked to your employee record. Contact your administrator.</p>
        </div>
      </div>
    )
  }

  const { data: wellness } = await supabase.from('daily_wellness').select('*').eq('employee_id', employee.id).order('date', { ascending: false }).limit(8)
  const { data: habits } = await supabase.from('habits').select('*').eq('employee_id', employee.id).order('date', { ascending: false }).limit(1)
  const { data: workouts } = await supabase.from('workouts').select('*').eq('employee_id', employee.id).order('date', { ascending: false }).limit(1)
  const { data: pulse } = await supabase.from('pulse_surveys').select('*').eq('employee_id', employee.id).order('date', { ascending: false }).limit(4)

  return <MyDashboardClient employee={employee} wellness={wellness ?? []} habits={habits?.[0] ?? null} workout={workouts?.[0] ?? null} pulse={pulse ?? []} />
}
