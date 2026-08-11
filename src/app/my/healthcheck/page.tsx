import { DashboardShell } from '@/components/layout/DashboardShell'
import { getRoleAndSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { HealthcheckClient } from './HealthcheckClient'

export const dynamic = 'force-dynamic'

export default async function HealthcheckPage() {
  const { session, role, mustChangePassword } = await getRoleAndSession()
  if (!session) redirect('/login')
  if (mustChangePassword) redirect('/change-password')
  if (role && role !== 'participant') redirect('/wellness-director')

  return (
    <DashboardShell title="Participant Healthcheck" showPeriodFilter={false} showExport={false} showSignOut={false}>
      <HealthcheckClient />
    </DashboardShell>
  )
}
