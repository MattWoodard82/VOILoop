import { CardSkeleton } from '@/components/ui'

export default function Loading() {
  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {Array.from({ length: 4 }).map((_, index) => (
            <CardSkeleton key={index} lines={3} minHeight={96} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {Array.from({ length: 3 }).map((_, index) => (
            <CardSkeleton key={index} lines={3} minHeight={96} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <CardSkeleton title="Mental wellbeing by participant" lines={7} minHeight={240} />
          <CardSkeleton title="Question breakdown" lines={7} minHeight={240} />
        </div>
      </div>
    </div>
  )
}
