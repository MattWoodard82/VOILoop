import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/supabase/server'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { getParticipants } from '@/lib/supabase/queries'
import { WhoopImportClient } from './import/WhoopImportClient'
import { AccountProvisioningClient } from './accounts/AccountProvisioningClient'
import { ChallengesAdminClient } from './challenges/ChallengesAdminClient'
import { isPilotChallengesBasicEnabled } from '@/lib/feature-flags'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { Participant } from '@/types'

interface ParticipantWithAuthUserId extends Participant {
  auth_user_id?: string | null
}

async function getAuthEmailByUserId(authUserIds: string[]): Promise<Map<string, string>> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return new Map()
  }

  const idSet = new Set(authUserIds)
  if (!idSet.size) return new Map()

  const emailByUserId = new Map<string, string>()
  const adminClient = createAdminSupabaseClient()

  let page = 1
  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error

    const users = data.users ?? []
    for (const user of users) {
      if (user.email && idSet.has(user.id)) {
        emailByUserId.set(user.id, user.email)
      }
    }

    if (users.length < 1000 || emailByUserId.size >= idSet.size) {
      break
    }

    page += 1
  }

  return emailByUserId
}

export const metadata = { title: 'Admin — VOILoop' }

export default async function AdminPage() {
  const { redirect: redirectTo } = await requireAdmin()
  if (redirectTo) redirect(redirectTo)

  const participantRecords = await getParticipants() as ParticipantWithAuthUserId[]
  const authUserIds = participantRecords
    .map((participant) => participant.auth_user_id)
    .filter((value): value is string => Boolean(value))
  const emailByUserId = await getAuthEmailByUserId(authUserIds)

  const participants = participantRecords.map((participant) => ({
    id: participant.id,
    label: (participant.auth_user_id ? emailByUserId.get(participant.auth_user_id) : undefined) ?? `${participant.first_name} ${participant.last_name}`.trim(),
    meta: [participant.department, participant.title].filter(Boolean).join(' · '),
  }))

  return (
    <DashboardShell title="Admin" showPeriodFilter={false} showExport={false} showSignOut={false}>
      <div style={{ display: 'grid', gap: 16 }}>
        <section id="whoop-import" className="card">
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
            WHOOP data import
          </div>
          <div style={{ fontSize: 12, color: '#A5ACAF', marginBottom: 14 }}>
            Upload the required WHOOP CSV files for a selected participant.
          </div>
          <WhoopImportClient participants={participants} />
        </section>

        <section id="account-provisioning" className="card">
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
            Account provisioning
          </div>
          <div style={{ fontSize: 12, color: '#A5ACAF', marginBottom: 14 }}>
            Create participant and Wellness Director accounts from CSV email lists.
          </div>
          <AccountProvisioningClient />
        </section>

        <section id="challenges" className="card">
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
            Challenges
          </div>
          {!isPilotChallengesBasicEnabled() ? (
            <div style={{ fontSize: 12, color: '#A5ACAF' }}>
              Set <code>PILOT_CHALLENGES_BASIC=true</code> to enable challenge management.
            </div>
          ) : (
            <ChallengesAdminClient />
          )}
        </section>
      </div>
    </DashboardShell>
  )
}
