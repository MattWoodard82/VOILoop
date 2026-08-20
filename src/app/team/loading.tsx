import { CardSkeleton } from '@/components/ui'

export default function Loading() {
  return (
    <div style={{ padding: "20px 24px" }}>
      <CardSkeleton title="Participant ranking context" lines={5} minHeight={180} />
    </div>
  )
}
