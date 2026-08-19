import { DashboardShell } from '@/components/layout/DashboardShell'
import { CardSkeleton } from '@/components/ui'

export default function Loading() {
  return (
    <DashboardShell title="Admin" showPeriodFilter={false} showExport={false} showSignOut={false}>
      <div style={{ display: 'grid', gap: 16 }}>
        <CardSkeleton title="WHOOP data import" lines={5} minHeight={220} />
        <CardSkeleton title="Account provisioning" lines={5} minHeight={220} />
        <CardSkeleton title="Rewards rollout" lines={6} minHeight={300} />
      </div>
    </DashboardShell>
  )
}
