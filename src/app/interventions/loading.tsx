import { DashboardShell } from '@/components/layout/DashboardShell'
import { CardSkeleton } from '@/components/ui'

export default function Loading() {
  return (
    <DashboardShell title="Intervention Tracking">
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {Array.from({ length: 4 }).map((_, index) => (
            <CardSkeleton key={index} lines={3} minHeight={96} />
          ))}
        </div>
        <CardSkeleton title="Active intervention log" lines={8} minHeight={260} />
      </div>
    </DashboardShell>
  )
}
