import { DashboardShell } from '@/components/layout/DashboardShell'
import { CardSkeleton } from '@/components/ui'

export default function Loading() {
  return (
    <DashboardShell title="Team Roster">
      <CardSkeleton title="Participant ranking context" lines={5} minHeight={180} />
    </DashboardShell>
  )
}
