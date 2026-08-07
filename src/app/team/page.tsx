import { DashboardShell } from '@/components/layout/DashboardShell'
import { getParticipantRankContext } from '@/lib/supabase/queries'
import { getSession } from '@/lib/supabase/server'
import { TeamRosterClient } from './TeamRosterClient'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function TeamPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const participantContext = await getParticipantRankContext(session.user.id, 'recovery')
  return (
    <DashboardShell title="Team Roster">
      <TeamRosterClient participantContext={participantContext} />
    </DashboardShell>
  )
}
