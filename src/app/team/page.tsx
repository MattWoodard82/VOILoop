import { DashboardShell } from '@/components/layout/DashboardShell'
import { getTeamDashboard } from '@/lib/supabase/queries'
import { TeamRosterClient } from './TeamRosterClient'
import { requireAuth } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function TeamPage() {
  const access = await requireAuth()
  if ('redirect' in access && access.redirect) redirect(access.redirect)
  if (!access.role || !['admin', 'wellness_director'].includes(access.role)) redirect('/my')

  const { participants } = await getTeamDashboard()
  return (
    <DashboardShell title="Team Roster">
      <TeamRosterClient participants={participants} />
    </DashboardShell>
  )
}
