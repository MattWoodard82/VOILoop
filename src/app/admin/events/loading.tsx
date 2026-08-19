import { DashboardShell } from '@/components/layout/DashboardShell'
import { CardSkeleton } from '@/components/ui'

export default function Loading() {
  return (
    <DashboardShell title="Events and nudges" showPeriodFilter={false} showExport={false} showSignOut={false}>
      <div style={{ display: 'grid', gap: 14 }}>
        <CardSkeleton title="Create new event" lines={6} minHeight={260} />
        <CardSkeleton title="Upcoming events" lines={6} minHeight={220} />
      </div>
    </DashboardShell>
  )
}
