import { Card, CardSkeleton, ChartSkeleton } from '@/components/ui'

export default function Loading() {
  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ display: 'grid', gap: 14 }}>
        <CardSkeleton title="Loading outcomes" lines={2} minHeight={72} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {Array.from({ length: 4 }).map((_, index) => (
            <CardSkeleton key={index} lines={3} minHeight={96} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <CardSkeleton title="Intervention outcome distribution" lines={6} minHeight={220} />
          <Card title="Team recovery trend"><ChartSkeleton height={160} /></Card>
        </div>
      </div>
    </div>
  )
}
