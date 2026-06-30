import { DashboardShell } from '@/components/layout/DashboardShell'
import { getTeamDashboard } from '@/lib/supabase/queries'
import { TeamRosterClient } from './TeamRosterClient'

export const revalidate = 60

export default async function TeamPage() {
  const { employees } = await getTeamDashboard()
  return (
    <DashboardShell title="Team Roster">
      <TeamRosterClient employees={employees} />
    </DashboardShell>
  )
}
