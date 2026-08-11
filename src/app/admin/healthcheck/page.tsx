import { DashboardShell } from '@/components/layout/DashboardShell'
import { requireAdmin } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { HealthcheckClient } from '../../my/healthcheck/HealthcheckClient'

export const dynamic = 'force-dynamic'

export default async function AdminHealthcheckPage() {
  const { redirect: redirectTo } = await requireAdmin()
  if (redirectTo) redirect(redirectTo)

  return (
    <DashboardShell title="Admin Healthcheck" showPeriodFilter={false} showExport={false} showSignOut={false}>
      <HealthcheckClient />
    </DashboardShell>
  )
}
