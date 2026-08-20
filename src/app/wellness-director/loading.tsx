import { Card, CardSkeleton, ChartSkeleton } from '@/components/ui'

export default function Loading() {
  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ display: 'grid', gap: 14 }}>
        <CardSkeleton title="Loading dashboard" lines={2} minHeight={72} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {Array.from({ length: 4 }).map((_, index) => (
            <CardSkeleton key={index} lines={3} minHeight={96} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          <Card title="Engagement score"><ChartSkeleton height={210} /></Card>
          <CardSkeleton title="Score breakdown" lines={5} minHeight={210} />
          <CardSkeleton title="Physiological trend" lines={3} minHeight={210} />
          <CardSkeleton title="Risk tier" lines={3} minHeight={210} />
        </div>
      </div>
    </div>
  )
}
