import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { requireLeadership } from '@/lib/supabase/server'
import { getParticipants } from '@/lib/supabase/queries'
import { AdminEventsClient } from '@/app/admin/events/AdminEventsClient'

export async function EventsPageContent() {
  const leadership = await requireLeadership()
  const { redirect: redirectTo } = leadership
  if (redirectTo) redirect(redirectTo)
  const role = leadership.role
  if (!role) redirect('/my')

  const participantRecords = await getParticipants()
  const participants = participantRecords.map((participant) => ({
    id: participant.id,
    label: `${participant.first_name} ${participant.last_name}`,
    meta: [participant.department, participant.title].filter(Boolean).join(' · '),
  }))

  return (
    <DashboardShell title="Events and nudges" showPeriodFilter={false} showExport={false} showSignOut={false}>
      <AdminEventsClient participants={participants} role={role} />
    </DashboardShell>
  )
}
