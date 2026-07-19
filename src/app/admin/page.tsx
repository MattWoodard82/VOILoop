import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/supabase/server'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { getParticipants } from '@/lib/supabase/queries'
import { WhoopImportClient } from './import/WhoopImportClient'

export const metadata = { title: 'Admin — VOILoop' }

export default async function AdminPage() {
  const { redirect: redirectTo } = await requireAdmin()
  if (redirectTo) redirect(redirectTo)

  const participantRecords = await getParticipants()
  const participants = participantRecords.map((participant) => ({
    id: participant.id,
    label: `${participant.first_name} ${participant.last_name}`.trim(),
    meta: [participant.department, participant.title].filter(Boolean).join(' · '),
  }))

  return (
    <DashboardShell title="Admin" showPeriodFilter={false} showExport={false} showSignOut={false}>
      <WhoopImportClient participants={participants} />
    </DashboardShell>
  )
}
