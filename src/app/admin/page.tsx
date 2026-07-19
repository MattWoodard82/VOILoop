import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/supabase/server'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { getEmployees } from '@/lib/supabase/queries'
import { WhoopImportClient } from './import/WhoopImportClient'

export const metadata = { title: 'Admin — VOILoop' }

export default async function AdminPage() {
  const { redirect: redirectTo } = await requireAdmin()
  if (redirectTo) redirect(redirectTo)

  const employees = await getEmployees()
  const participants = employees.map((employee) => ({
    id: employee.id,
    label: `${employee.first_name} ${employee.last_name}`.trim(),
    meta: [employee.department, employee.title].filter(Boolean).join(' · '),
  }))

  return (
    <DashboardShell title="Admin" showPeriodFilter={false} showExport={false} showSignOut={false}>
      <WhoopImportClient participants={participants} />
    </DashboardShell>
  )
}
