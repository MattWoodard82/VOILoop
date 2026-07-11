import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { ensureEmployeeForAuthUser } from '@/lib/employee-linking'
import { redirect } from 'next/navigation'
import { MyDashboardClient } from './MyDashboardClient'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { isPilotChallengesBasicEnabled } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'

export default async function MyPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let { data: employee } = await supabase
    .from('employees').select('*').eq('auth_user_id', user.id).single()

  if (!employee && user.email) {
    const adminClient = createAdminSupabaseClient()
    const employeeId = await ensureEmployeeForAuthUser(adminClient, user.id, user.email)
    const { data: linkedEmployee } = await supabase
      .from('employees')
      .select('*')
      .eq('id', employeeId)
      .single()
    employee = linkedEmployee
  }

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
  let challenge: {
    visibility_state: 'none' | 'ineligible' | 'eligible'
    data: {
      id: string
      name: string
      threshold_value: number
      progress_value: number
      completed: boolean
      completed_at: string | null
      last_computed_at: string | null
      status: 'active' | 'cancelled' | 'completed' | 'draft'
    } | null
  } | null = null

  if (isPilotChallengesBasicEnabled()) {
    const { data: activeChallenge } = await supabase
      .from('challenges')
      .select('id, name, status, threshold_value')
      .eq('status', 'active')
      .maybeSingle()

    let visibleChallenge = activeChallenge
    if (!visibleChallenge) {
      const { data: terminalChallenge } = await supabase
        .from('challenges')
        .select('id, name, status, threshold_value')
        .in('status', ['cancelled', 'completed'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      visibleChallenge = terminalChallenge
    }

    if (visibleChallenge) {
      const { data: participant } = await supabase
        .from('challenge_participants')
        .select('is_eligible, progress_value, completed, completed_at, updated_at')
        .eq('challenge_id', visibleChallenge.id)
        .eq('employee_id', employee.id)
        .maybeSingle()

      challenge = {
        visibility_state: participant?.is_eligible ? 'eligible' : 'ineligible',
        data: {
          id: visibleChallenge.id,
          name: visibleChallenge.name,
          status: visibleChallenge.status,
          threshold_value: visibleChallenge.threshold_value,
          progress_value: participant?.is_eligible ? (participant.progress_value ?? 0) : 0,
          completed: Boolean(participant?.completed),
          completed_at: participant?.completed_at ?? null,
          last_computed_at: participant?.updated_at ?? null,
        },
      }
    } else {
      challenge = { visibility_state: 'none', data: null }
    }
  }

  return <MyDashboardClient userEmail={user.email ?? ''} employee={employee} wellness={wellness ?? []} habits={habits?.[0] ?? null} workout={workouts?.[0] ?? null} pulse={pulse ?? []} challenge={challenge} />
}
