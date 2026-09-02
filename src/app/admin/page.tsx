import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/supabase/server'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { getParticipants } from '@/lib/supabase/queries'
import { WhoopImportClient } from './import/WhoopImportClient'
import { AccountProvisioningClient } from './accounts/AccountProvisioningClient'
import { ChallengesAdminClient } from './challenges/ChallengesAdminClient'
import { EngagementWeightsAdminClient } from './EngagementWeightsAdminClient'
import { TeamHealthScoreBaselineAdminClient } from './TeamHealthScoreBaselineAdminClient'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getAuthEmailsByUserId } from '@/lib/supabase/auth-emails'
import type { Participant } from '@/types'
import Link from 'next/link'

async function getAuthEmailByUserId(authUserIds: string[]): Promise<Map<string, string>> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return new Map()
  }
  if (!authUserIds.length) return new Map()

  const adminClient = createAdminSupabaseClient()
  return getAuthEmailsByUserId(adminClient, authUserIds)
}

export const metadata = { title: 'Admin — VOILoop' }

export default async function AdminPage() {
  const { redirect: redirectTo } = await requireAdmin()
  if (redirectTo) redirect(redirectTo)

  const participantRecords = await getParticipants()
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
            Rewards rollout
          </div>
          <ChallengesAdminClient />
        </section>

        <section id="engagement-score-weights" className="card">
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
            Engagement-score weights
          </div>
          <div style={{ fontSize: 12, color: '#A5ACAF', marginBottom: 14 }}>
            Set the FR-13 engagement-score component weights for the whole cohort. Wellness Directors see these values read-only on their dashboard.
          </div>
          <EngagementWeightsAdminClient />
        </section>

        <section id="team-health-score-baseline" className="card">
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
            Team Health Score baseline window
          </div>
          <div style={{ fontSize: 12, color: '#A5ACAF', marginBottom: 14 }}>
            Set the baseline comparison window used for the Team Health Score Trend and 5-Metric Breakdown, for the whole cohort. Wellness Directors see this window read-only on their dashboard.
          </div>
          <TeamHealthScoreBaselineAdminClient />
        </section>

        <section id="events-nudges" className="card">
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
            Events and nudges
          </div>
          <div style={{ fontSize: 12, color: '#A5ACAF', marginBottom: 14 }}>
            Manage participant-facing events and weekly nudges.
          </div>
          <Link
            href="/wellness-director/events"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#69BE28',
              color: '#002244',
              borderRadius: 7,
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Open events manager
          </Link>
        </section>

        <section id="healthchecks" className="card">
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
            Healthchecks
          </div>
          <div style={{ fontSize: 12, color: '#A5ACAF', marginBottom: 14 }}>
            Run participant-facing diagnostics for ranking privacy and Priority 4 insight calculations.
          </div>
          <Link
            href="/admin/healthcheck"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#69BE28',
              color: '#002244',
              borderRadius: 7,
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Open admin healthcheck
          </Link>
        </section>
      </div>
    </DashboardShell>
  )
}
