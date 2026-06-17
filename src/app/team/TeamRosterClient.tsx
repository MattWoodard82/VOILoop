'use client'
import { useState } from 'react'
import type { EmployeeWithWellness } from '@/types'
import { Card, Badge, ScorePill } from '@/components/ui'
import { recoveryColor, initials } from '@/lib/utils'

const AV_COLORS = [
  ['#1a4a2e', '#69BE28'], ['#1a2e4a', '#A5ACAF'], ['#2e1a1a', '#ff6b6b'],
  ['#2a2a1a', '#FFA500'], ['#1a1a3a', '#8888ff'], ['#2a1a3a', '#cc88ff'],
]

const HABITS = [
  ['alcohol', 'Alcohol'], ['caffeine', 'Caffeine'], ['ate_late', 'Ate late'],
  ['hydrated', 'Hydrated'], ['protein', 'Protein'], ['magnesium', 'Magnesium'],
  ['theanine', 'L-Theanine'], ['creatine', 'Creatine'], ['ashwagandha', 'Ashwagandha'],
  ['tracked_calories', 'Tracked calories'], ['dimmed_lights', 'Dimmed lights'],
  ['read_before_bed', 'Read before bed'],
] as const

export function TeamRosterClient({ employees }: { employees: EmployeeWithWellness[] }) {
  const [filter, setFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all')
  const [selected, setSelected] = useState<EmployeeWithWellness | null>(null)

  const filtered = employees.filter((e) => {
    if (filter === 'all') return true
    if (filter === 'green') return e.recovery_status === 'green'
    if (filter === 'yellow') return e.recovery_status === 'yellow'
    if (filter === 'red') return e.recovery_status === 'red'
    return true
  })

  return (
    <>
      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {(['all', 'green', 'yellow', 'red'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
              fontFamily: 'Inter, sans-serif', border: '1px solid',
              borderColor: filter === f ? '#69BE28' : '#0a3560',
              background: filter === f ? '#69BE28' : '#001a33',
              color: filter === f ? '#002244' : '#A5ACAF',
              fontWeight: filter === f ? 700 : 400,
            }}>
            {f === 'all' ? 'All employees' : f === 'green' ? 'Green ≥67' : f === 'yellow' ? 'Yellow 34–66' : 'Red <34'}
          </button>
        ))}
      </div>

      {/* Roster table */}
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 95px 55px 50px 55px 55px 60px', gap: 6, fontSize: 9, color: '#A5ACAF', paddingBottom: 8, borderBottom: '1px solid #0a3560', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
          <span /><span>Employee</span><span>Dept</span>
          <span style={{ textAlign: 'center' }}>Recovery</span>
          <span style={{ textAlign: 'center' }}>HRV</span>
          <span style={{ textAlign: 'center' }}>Sleep%</span>
          <span style={{ textAlign: 'center' }}>Strain</span>
          <span style={{ textAlign: 'right' }}>Risk</span>
        </div>
        {filtered.map((e, i) => {
          const [bg, fg] = AV_COLORS[employees.indexOf(e) % AV_COLORS.length]
          const w = e.latest_wellness
          return (
            <div key={e.id} onClick={() => setSelected(e === selected ? null : e)}
              style={{
                display: 'grid', gridTemplateColumns: '28px 1fr 95px 55px 50px 55px 55px 60px',
                gap: 6, padding: '9px 0', borderBottom: '1px solid #0a3560',
                cursor: 'pointer', alignItems: 'center',
                background: e.is_exact_data ? 'rgba(105,190,40,0.05)' : 'transparent',
              }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                {initials(e.first_name, e.last_name)}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>
                  {e.first_name} {e.last_name}
                  {e.is_exact_data && <span style={{ background: 'rgba(105,190,40,0.2)', color: '#69BE28', fontSize: 9, padding: '1px 6px', borderRadius: 10, fontWeight: 700, marginLeft: 6, border: '1px solid #69BE28' }}>COO · Exact</span>}
                </div>
                <div style={{ fontSize: 10, color: '#A5ACAF' }}>{e.department} · {e.title}</div>
              </div>
              <div style={{ fontSize: 11, color: '#A5ACAF' }}>{e.department}</div>
              <div style={{ textAlign: 'center' }}><ScorePill value={w?.recovery_score ?? 0} /></div>
              <div style={{ textAlign: 'center', fontSize: 11, color: '#A5ACAF' }}>{w?.hrv_ms ?? '—'}ms</div>
              <div style={{ textAlign: 'center', fontSize: 11, color: '#A5ACAF' }}>{w?.sleep_perf ?? '—'}%</div>
              <div style={{ textAlign: 'center', fontSize: 11, color: '#A5ACAF' }}>{w?.day_strain ?? '—'}</div>
              <div style={{ textAlign: 'right' }}><Badge variant={e.risk_level === 'Low' ? 'green' : e.risk_level === 'Medium' ? 'amber' : 'red'}>{e.risk_level}</Badge></div>
            </div>
          )
        })}
      </Card>
  {/* Recovery Leaderboard */}
      <Card title="🏆 Recovery Leaderboard" className="mt-4">
        <div style={{ marginBottom: 8, fontSize: 11, color: '#A5ACAF' }}>
          Ranked by recovery score this week — keep your streak going
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 80px 80px', gap: 6, fontSize: 11, color: '#A5ACAF', paddingBottom: 8, borderBottom: '1px solid #0a3560', marginBottom: 6 }}>
          <span>#</span>
          <span>Employee</span>
          <span style={{ textAlign: 'center' }}>Score</span>
          <span style={{ textAlign: 'center' }}>Streak</span>
          <span style={{ textAlign: 'center' }}>Status</span>
        </div>
        {[...employees]
          .sort((a, b) => (b.latest_wellness?.recovery_score ?? 0) - (a.latest_wellness?.recovery_score ?? 0))
          .map((e, i) => {
            const score = e.latest_wellness?.recovery_score ?? 0
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`
            const color = score >= 67 ? '#69BE28' : score >= 34 ? '#FFA500' : '#ff6b6b'
            const status = score >= 67 ? 'On Track' : score >= 34 ? 'At Risk' : 'Flagged'
            const badgeColor = score >= 67 ? '#69BE2822' : score >= 34 ? '#FFA50022' : '#ff6b6b22'
            const badgeText = score >= 67 ? '#69BE28' : score >= 34 ? '#FFA500' : '#ff6b6b'
            return (
              <div key={e.id} onClick={() => setSelected(e === selected ? null : e)}
                style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 80px 80px', gap: 6, padding: '8px 0', borderBottom: '1px solid #0a356066', alignItems: 'center', cursor: 'pointer' }}
                onMouseEnter={ev => (ev.currentTarget.style.background = '#001a33')}
                onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}>
                <span style={{ fontSize: i < 3 ? 16 : 12, textAlign: 'center', color: '#A5ACAF', fontWeight: 700 }}>{medal}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{e.first_name} {e.last_name}</div>
                  <div style={{ fontSize: 10, color: '#A5ACAF' }}>{e.department}</div>
                </div>
                <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 800, color }}>{score}</div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: 10, color: '#69BE28' }}>
                    {score > 0 ? '🔥 Active' : '—'}
                  </span>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 99, background: badgeColor, color: badgeText, fontWeight: 700 }}>
                    {status}
                  </span>
                </div>
              </div>
            )
          })}
      </Card>
