import { CardSkeleton } from '@/components/ui'

export default function Loading() {
  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ display: 'grid', gap: 14 }}>
        <CardSkeleton title="Create new event" lines={6} minHeight={260} />
        <CardSkeleton title="Upcoming events" lines={6} minHeight={220} />
      </div>
    </div>
  )
}
