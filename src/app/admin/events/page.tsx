import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { requireLeadership } from '@/lib/supabase/server'
import { getParticipants } from '@/lib/supabase/queries'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { AdminEventsClient } from './AdminEventsClient'

export const metadata = { title: 'Admin Events — VOILoop' }

async function getAuthEmailByUserId(authUserIds: string[]): Promise<Map<string, string>> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return new Map()
  }

  const idSet = new Set(authUserIds)
  if (!idSet.size) return new Map()

  const emailByUserId = new Map<string, string>()
  const adminClient = createAdminSupabaseClient()
  for (const authUserId of Array.from(idSet)) {
    const { data, error } = await adminClient.auth.admin.getUserById(authUserId)
    if (error) {
      const lowerMessage = error.message.toLowerCase()
      if (lowerMessage.includes('not found') || lowerMessage.includes('does not exist')) {
        continue
      }
      throw error
    }
    if (data.user?.email) {
      emailByUserId.set(authUserId, data.user.email)
    }
  }

  return emailByUserId
}

export default async function AdminEventsPage() {
  const leadership = await requireLeadership()
  const { redirect: redirectTo } = leadership
  if (redirectTo) redirect(redirectTo)
  const role = leadership.role
  if (!role) redirect('/my')

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
    <DashboardShell title="Events and nudges" showPeriodFilter={false} showExport={false} showSignOut={false}>
      <AdminEventsClient participants={participants} role={role} />
    </DashboardShell>
  )
}
