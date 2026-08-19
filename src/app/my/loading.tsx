import { DashboardShell } from '@/components/layout/DashboardShell'
import { Card, CardSkeleton, ChartSkeleton, SkeletonBlock } from '@/components/ui'

export default function Loading() {
  return (
    <DashboardShell title="My Wellness Dashboard" showPeriodFilter={false} showExport={false} showSignOut={false}>
      <div style={{ display: 'grid', gap: 14 }}>
        <CardSkeleton title="Loading dashboard" lines={4} minHeight={120} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {Array.from({ length: 4 }).map((_, index) => (
            <CardSkeleton key={index} lines={3} minHeight={96} />
          ))}
        </div>
        <CardSkeleton title="Your baseline vs recent 21 days" lines={5} minHeight={150} />
        <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 14 }}>
          <Card title="Recovery and sleep trend">
            <ChartSkeleton height={220} />
          </Card>
          <CardSkeleton title="Latest detail" lines={6} minHeight={220} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <CardSkeleton title="Latest habits" lines={5} minHeight={180} />
          <CardSkeleton title="Latest workout" lines={5} minHeight={180} />
        </div>
        <Card title="Loading activity">
          <div style={{ display: 'grid', gap: 10, minHeight: 160 }}>
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} style={{ display: 'flex', gap: 12 }}>
                <SkeletonBlock width={24} height={24} radius="50%" />
                <div style={{ flex: 1, display: 'grid', gap: 8 }}>
                  <SkeletonBlock width="26%" height={10} radius={999} />
                  <SkeletonBlock width="72%" height={10} radius={999} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </DashboardShell>
  )
}
