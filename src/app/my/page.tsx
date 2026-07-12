import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { ensureEmployeeForAuthUser } from '@/lib/employee-linking'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { formatDate } from '@/lib/utils'
import { redirect } from 'next/navigation'
import { MyDashboardClient } from './MyDashboardClient'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { getRoleAndSession } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function MyPage() {
  const { session, role, mustChangePassword } = await getRoleAndSession()
  if (!session) redirect('/login')
  if (mustChangePassword) redirect('/change-password')
  if (role && role !== 'employee') redirect('/wellness-director')

  const user = session.user
  const supabase = createServerSupabaseClient()

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

  const trendWindowStart = new Date()
  trendWindowStart.setDate(trendWindowStart.getDate() - 28)
  const trendWindowStartDate = trendWindowStart.toISOString().slice(0, 10)

  let { data: wellness } = await supabase
    .from('daily_wellness')
    .select('*')
    .eq('employee_id', employee.id)
    .gte('date', trendWindowStartDate)
    .order('date', { ascending: false })

  if (!wellness?.length) {
    const { data: latestWellness } = await supabase
      .from('daily_wellness')
      .select('*')
      .eq('employee_id', employee.id)
      .order('date', { ascending: false })
      .limit(1)

    wellness = latestWellness ?? []
  }

  const { data: habits } = await supabase.from('habits').select('*').eq('employee_id', employee.id).order('date', { ascending: false }).limit(1)
  const { data: workouts } = await supabase.from('workouts').select('*').eq('employee_id', employee.id).order('date', { ascending: false }).limit(1)
  const { data: pulse } = await supabase.from('pulse_surveys').select('*').eq('employee_id', employee.id).order('date', { ascending: false }).limit(4)
  const { data: importBatches } = await supabase
    .from('upload_batches')
    .select('*')
    .eq('imported_by', user.id)
    .order('started_at', { ascending: false })
    .limit(5)

  const latestWellnessDate = wellness?.[0]?.date ? formatDate(wellness[0].date) : null

  return (
    <DashboardShell
      title="My Wellness Dashboard"
      period={latestWellnessDate}
      showPeriodFilter={false}
      showExport={false}
      showSignOut={false}
    >
      <MyDashboardClient
        employee={employee}
        wellness={wellness ?? []}
        habits={habits?.[0] ?? null}
        workout={workouts?.[0] ?? null}
        pulse={pulse ?? []}
        importBatches={importBatches ?? []}
      />
    </DashboardShell>
  )
}
