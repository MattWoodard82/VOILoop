import Link from 'next/link'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { isRewardsRolloutEnabled } from '@/lib/feature-flags'

export const metadata = { title: 'Rules — VOILoop' }

const rules = [
  {
    title: 'Accrual',
    body: 'Points accrue daily from eligible wellness activities. During pilot rollout phases, the operator team manages point balances and recomputes them from the source of truth. Participant view is gated by the PILOT_CHALLENGES_BASIC rollout flag.',
  },
  {
    title: 'Caps',
    body: 'Weekly point caps are enforced by the active rewards policy. Check with your operator for the current weekly cap and bonus tiers for this pilot rollout.',
  },
  {
    title: 'Bonuses',
    body: 'Bonus points are awarded only after the associated activity is confirmed or explicitly approved by an operator. Redemption requires admin verification in the PTO request flow.',
  },
]

export default function RulesPage() {
  return (
    <DashboardShell title="Rules" showPeriodFilter={false} showExport={false} showSignOut={false}>
      <div style={{ display: 'grid', gap: 16 }}>
        {!isRewardsRolloutEnabled() ? (
          <div className="card" style={{ color: '#A5ACAF' }}>
            Rules are hidden until the rewards rollout is enabled.
          </div>
        ) : (
          <>
            <section className="card" style={{ display: 'grid', gap: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Rewards rules</div>
              <div style={{ fontSize: 12, color: '#A5ACAF' }}>
                Transparent rollout notes for points, PTO request handoff, and approvals.
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                {rules.map((rule) => (
                  <div key={rule.title} style={{ border: '1px solid #0a3560', borderRadius: 10, padding: 14, background: '#001a33' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{rule.title}</div>
                    <div style={{ fontSize: 12, color: '#A5ACAF', lineHeight: 1.6 }}>{rule.body}</div>
                  </div>
                ))}
              </div>
            </section>
            <section className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Operator order</div>
                <div style={{ fontSize: 12, color: '#A5ACAF' }}>Enable rollout, verify rules content, then open rewards for participants.</div>
              </div>
              <Link href="/admin" style={{ color: '#69BE28', fontWeight: 700, textDecoration: 'none' }}>
                Open admin
              </Link>
            </section>
          </>
        )}
      </div>
    </DashboardShell>
  )
}
