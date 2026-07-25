import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { requireAdmin } from '@/lib/supabase/server'
import { AdminEventsClient } from './AdminEventsClient'

export const metadata = { title: 'Admin Events — VOILoop' }

export default async function AdminEventsPage() {
  const { redirect: redirectTo } = await requireAdmin()
  if (redirectTo) redirect(redirectTo)

  return (
    <DashboardShell title="Admin · Events and nudges" showPeriodFilter={false} showExport={false} showSignOut={false}>
      <AdminEventsClient />
    </DashboardShell>
  )
}
