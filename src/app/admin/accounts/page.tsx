import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { requireAdmin } from '@/lib/supabase/server'
import { AccountProvisioningClient } from './AccountProvisioningClient'

export const metadata = { title: 'Account Provisioning - VOILoop' }

export default async function AdminAccountsPage() {
  const { redirect: redirectTo } = await requireAdmin()
  if (redirectTo) redirect(redirectTo)

  return (
    <DashboardShell title="Account Provisioning">
      <AccountProvisioningClient />
    </DashboardShell>
  )
}
