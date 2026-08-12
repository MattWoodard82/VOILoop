import { DashboardShell } from '@/components/layout/DashboardShell'
import { getParticipantRankContext } from '@/lib/supabase/queries'
import { getSession } from '@/lib/supabase/server'
import { TeamRosterClient } from './TeamRosterClient'
import { Card } from '@/components/ui'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function TeamPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  let participantContext
  try {
    participantContext = await getParticipantRankContext(session.user.id, 'recovery')
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'status' in error && Number((error as { status: number }).status) === 404) {
      return (
        <DashboardShell title="My Ranking" showExport={false}>
          <Card title="Participant ranking context">
            <div style={{ color: '#A5ACAF' }}>Your participant record is being prepared. Check back shortly.</div>
          </Card>
        </DashboardShell>
      )
    }
    throw error
  }

  return (
    <DashboardShell title="My Ranking" showExport={false}>
      <TeamRosterClient participantContext={participantContext} />
    </DashboardShell>
  )
}
