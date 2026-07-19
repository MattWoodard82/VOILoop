import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/supabase/server'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { WhoopImportClient } from './WhoopImportClient'
import { getParticipants } from '@/lib/supabase/queries'

export const metadata = { title: 'WHOOP Import — VOILoop' }

export default async function WhoopImportPage() {
  const { redirect: redirectTo } = await requireAdmin()
  if (redirectTo) redirect(redirectTo)
  const participantRecords = await getParticipants()
  const participants = participantRecords.map((participant) => ({
    id: participant.id,
    label: `${participant.first_name} ${participant.last_name}`.trim(),
    meta: [participant.department, participant.title].filter(Boolean).join(' · '),
  }))

  return (
    <DashboardShell title="WHOOP Data Import" showPeriodFilter={false} showExport={false} showSignOut={false}>
      <WhoopImportClient participants={participants} />
    </DashboardShell>
  )
}
