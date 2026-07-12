import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { requireAuth } from '@/lib/supabase/server'
import { isPilotChallengesBasicEnabled } from '@/lib/feature-flags'
import { ChallengesAdminClient } from './ChallengesAdminClient'

export const metadata = { title: 'Challenges - VOILoop' }

export default async function AdminChallengesPage() {
  const auth = await requireAuth(['admin', 'wellness_director'])
  if ('redirect' in auth && auth.redirect) redirect(auth.redirect)

  return (
    <DashboardShell title="Challenges">
      {!isPilotChallengesBasicEnabled() ? (
        <div className="card">
          <div style={{ fontSize: 13, color: '#fff', fontWeight: 600, marginBottom: 8 }}>
            Challenges pilot is disabled
          </div>
          <div style={{ fontSize: 12, color: '#A5ACAF' }}>
            Set <code>PILOT_CHALLENGES_BASIC=true</code> to enable challenge management in local environments.
          </div>
        </div>
      ) : (
        <ChallengesAdminClient />
      )}
    </DashboardShell>
  )
}
