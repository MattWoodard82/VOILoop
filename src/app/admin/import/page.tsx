import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/supabase/server'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { WhoopImportClient } from './WhoopImportClient'

export const metadata = { title: 'WHOOP Import — VOILoop' }

export default async function WhoopImportPage() {
  const { redirect: redirectTo } = await requireAuth(['admin', 'staff'])
  if (redirectTo) redirect(redirectTo)

  return (
    <DashboardShell title="WHOOP Data Import">
      <WhoopImportClient />
    </DashboardShell>
  )
}
