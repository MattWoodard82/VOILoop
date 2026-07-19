import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/supabase/server'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { WhoopImportClient } from './WhoopImportClient'
import { getEmployees } from '@/lib/supabase/queries'

export const metadata = { title: 'WHOOP Import — VOILoop' }

export default async function WhoopImportPage() {
  const { redirect: redirectTo } = await requireAdmin()
  if (redirectTo) redirect(redirectTo)
  const employees = await getEmployees()
  const participants = employees.map((employee) => ({
    id: employee.id,
    label: `${employee.first_name} ${employee.last_name}`.trim(),
    meta: [employee.department, employee.title].filter(Boolean).join(' · '),
  }))

  return (
    <DashboardShell title="WHOOP Data Import" showPeriodFilter={false} showExport={false} showSignOut={false}>
      <WhoopImportClient participants={participants} />
    </DashboardShell>
  )
}
