import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { ensureParticipantForAuthUser } from '@/lib/participant-linking'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { formatDate } from '@/lib/utils'
import { redirect } from 'next/navigation'
import { MyDashboardClient } from './MyDashboardClient'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { getRoleAndSession } from '@/lib/supabase/server'
import { isPilotChallengesBasicEnabled } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'

export default async function MyPage() {
  const { session, role, mustChangePassword } = await getRoleAndSession()
  if (!session) redirect('/login')
  if (mustChangePassword) redirect('/change-password')
  if (role && role !== 'participant') redirect('/wellness-director')

  const user = session.user
  const supabase = createServerSupabaseClient()

  let { data: participant } = await supabase
    .from('participants').select('*').eq('auth_user_id', user.id).single()

  if (!participant && user.email) {
    const adminClient = createAdminSupabaseClient()
    const participantId = await ensureParticipantForAuthUser(adminClient, user.id, user.email)
    const { data: linkedParticipant } = await supabase
      .from('participants')
      .select('*')
      .eq('id', participantId)
      .single()
    participant = linkedParticipant
  }

  if (!participant) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d1f35', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ background: '#002244', border: '1px solid #0a3560', borderRadius: 12, padding: 36, maxWidth: 400, textAlign: 'center', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 16, right: 16 }}>
            <SignOutButton />
          </div>
          <div style={{ fontSize: 32, marginBottom: 12 }}>👋</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Account not linked yet</h2>
          <p style={{ fontSize: 13, color: '#A5ACAF', lineHeight: 1.6 }}>Your login is set up but has not been linked to your participant record. Contact your administrator.</p>
        </div>
      </div>
    )
  }

  const trendWindowStart = new Date()
  trendWindowStart.setDate(trendWindowStart.getDate() - 28)
  const trendWindowStartDate = trendWindowStart.toISOString().slice(0, 10)

  let { data: wellness } = await supabase
    .from('daily_wellness')
    .select('*')
    .eq('participant_id', participant.id)
    .gte('date', trendWindowStartDate)
    .order('date', { ascending: false })

  if (!wellness?.length) {
    const { data: latestWellness } = await supabase
      .from('daily_wellness')
      .select('*')
      .eq('participant_id', participant.id)
      .order('date', { ascending: false })
      .limit(1)

    wellness = latestWellness ?? []
  }

  const { data: habits } = await supabase.from('habits').select('*').eq('participant_id', participant.id).order('date', { ascending: false }).limit(1)
  const { data: workouts } = await supabase.from('workouts').select('*').eq('participant_id', participant.id).order('date', { ascending: false }).limit(1)
  const { data: pulse } = await supabase.from('pulse_surveys').select('*').eq('participant_id', participant.id).order('date', { ascending: false }).limit(4)
  const { data: importBatches } = await supabase
    .from('upload_batches')
    .select('*')
    .eq('imported_by', user.id)
    .order('started_at', { ascending: false })
    .limit(5)

  let challenge: {
    visibility_state: 'none' | 'ineligible' | 'eligible'
    data: {
      id: string
      name: string
      threshold_value: number
      progress_value: number
      completed: boolean
      completed_at: string | null
      last_computed_at: string | null
      status: 'active' | 'cancelled' | 'completed' | 'draft'
    } | null
  } | null = null

  if (isPilotChallengesBasicEnabled()) {
    const { data: activeChallenge } = await supabase
      .from('challenges')
      .select('id, name, status, threshold_value')
      .eq('status', 'active')
      .maybeSingle()

    let visibleChallenge = activeChallenge
    if (!visibleChallenge) {
      const { data: terminalChallenge } = await supabase
        .from('challenges')
        .select('id, name, status, threshold_value')
        .in('status', ['cancelled', 'completed'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      visibleChallenge = terminalChallenge
    }

    if (visibleChallenge) {
      const { data: challengeParticipant } = await supabase
        .from('challenge_participants')
        .select('is_eligible, progress_value, completed, completed_at, updated_at')
        .eq('challenge_id', visibleChallenge.id)
        .eq('participant_id', participant.id)
        .maybeSingle()

      challenge = {
        visibility_state: challengeParticipant?.is_eligible ? 'eligible' : 'ineligible',
        data: {
          id: visibleChallenge.id,
          name: visibleChallenge.name,
          status: visibleChallenge.status,
          threshold_value: visibleChallenge.threshold_value,
          progress_value: challengeParticipant?.is_eligible ? (challengeParticipant.progress_value ?? 0) : 0,
          completed: Boolean(challengeParticipant?.completed),
          completed_at: challengeParticipant?.completed_at ?? null,
          last_computed_at: challengeParticipant?.updated_at ?? null,
        },
      }
    } else {
      challenge = { visibility_state: 'none', data: null }
    }
  }

  const latestWellnessDate = wellness?.[0]?.date ? formatDate(wellness[0].date) : null

  return (
    <DashboardShell
      title="My Wellness Dashboard"
      period={latestWellnessDate}
      showPeriodFilter={false}
      showExport={false}
      showSignOut={false}
    >
      <MyDashboardClient
        participant={participant}
        wellness={wellness ?? []}
        habits={habits?.[0] ?? null}
        workout={workouts?.[0] ?? null}
        pulse={pulse ?? []}
        challenge={challenge}
        importBatches={importBatches ?? []}
      />
    </DashboardShell>
  )
}
