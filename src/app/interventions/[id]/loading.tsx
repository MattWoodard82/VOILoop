import { CardSkeleton } from '@/components/ui'

export default function Loading() {
  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ display: 'grid', gap: 14 }}>
        <CardSkeleton title="Participant summary" lines={4} minHeight={120} />
        <CardSkeleton title="Biometric progress since intervention" lines={8} minHeight={220} />
        <CardSkeleton title="Wellness Director — Action Panel" lines={6} minHeight={220} />
      </div>
    </div>
  )
}
