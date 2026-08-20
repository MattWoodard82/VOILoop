export function WellnessDirectorCard({ name }: { name: string }) {
  return (
    <div
      style={{
        background: '#002244',
        border: '1px solid #0a3560',
        borderRadius: 10,
        padding: '14px 18px',
        marginBottom: 14,
      }}
    >
      <div style={{ fontSize: 10, color: '#A5ACAF', textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 600, marginBottom: 6 }}>
        Wellness director
      </div>
      <div style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>
        {name}
      </div>
    </div>
  )
}
