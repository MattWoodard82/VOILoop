import { DashboardShell } from '@/components/layout/DashboardShell'
import { getTeamDashboard } from '@/lib/supabase/queries'
import { TeamRosterClient } from './TeamRosterClient'

export const dynamic = 'force-dynamic'

export default async function TeamPage() {
  const { employees } = await getTeamDashboard()
  return (
    <DashboardShell title="Team Roster">
      <TeamRosterClient employees={employees} />
    </DashboardShell>
  )
}
