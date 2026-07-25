import { DashboardShell } from '@/components/layout/DashboardShell'
import { getTeamDashboard } from '@/lib/supabase/queries'
import { TeamRosterClient } from './TeamRosterClient'
import { requireAuth } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function TeamPage() {
  const access = await requireAuth(['admin', 'wellness_director'])
  if ('redirect' in access && access.redirect) redirect(access.redirect)

  const { participants } = await getTeamDashboard()
  return (
    <DashboardShell title="Team Roster">
      <TeamRosterClient participants={participants} />
    </DashboardShell>
  )
}
