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

      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 95px 55px 50px 55px 55px 60px', gap: 6, fontSize: 9, color: '#A5ACAF', paddingBottom: 8, borderBottom: '1px solid #0a3560', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <span /><span>Employee<span>Dept</span></span>
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
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                {initials(e.first_name, e.last_name)}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>
                  {e.first_name} {e.last_name}
                  {e.is_exact_data && <span style={{ background: 'rgba(105,190,40,0.2)', color: '#69BE28', fontSize: 9, padding: '1px 6px', borderRadius: 10, fontWeight: 700, marginLeft: 6, border: '1px solid rgba(105,190,40,0.4)' }}>Exact</span>}
                </div>
                <div style={{ fontSize: 10, color: '#A5ACAF' }}>{e.department} · {e.title}</div>
              </div>
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
      <Card title="🏆 Recovery Leaderboard">
        <div style={{ marginBottom: 8, fontSize: 11, color: '#A5ACAF' }}>
          Ranked by recovery score this week
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 60px 80px', gap: 6, fontSize: 11, color: '#A5ACAF', paddingBottom: 8, borderBottom: '1px solid #0a3560', marginBottom: 6 }}>
          <span>#</span>
          <span>Employee</span>
          <span style={{ textAlign: 'center' }}>Score</span>
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
              <div key={e.id}
                onClick={() => setSelected(e === selected ? null : e)}
                style={{ display: 'grid', gridTemplateColumns: '32px 1fr 60px 80px', gap: 6, padding: '8px 0', borderBottom: '1px solid #0a356066', alignItems: 'center', cursor: 'pointer' }}>
                <span style={{ fontSize: i < 3 ? 16 : 12, textAlign: 'center', color: '#A5ACAF', fontWeight: 700 }}>{medal}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{e.first_name} {e.last_name}</div>
                  <div style={{ fontSize: 10, color: '#A5ACAF' }}>{e.department}</div>
                </div>
                <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 800, color }}>{score}</div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 99, background: badgeColor, color: badgeText, fontWeight: 700 }}>{status}</span>
                </div>
              </div>
            )
          })}
      </Card>

      {selected && (
        <Card title={`${selected.first_name} ${selected.last_name} — ${selected.title}`}
          badge={<Badge variant={selected.risk_level === 'Low' ? 'green' : selected.risk_level === 'Medium' ? 'amber' : 'red'}>{selected.risk_level} risk</Badge>}
          className="mt-4">
          {selected.is_exact_data && (
            <div style={{ marginBottom: 12, padding: '6px 10px', background: 'rgba(105,190,40,0.08)', border: '1px solid rgba(105,190,40,0.2)', borderRadius: 6, fontSize: 10, color: '#69BE28' }}>
              ★ Exact WHOOP data — June 9 2026
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8, marginBottom: 16 }}>
            {[
              { l: 'Recovery', v: selected.latest_wellness?.recovery_score, u: '' },
              { l: 'HRV', v: selected.latest_wellness?.hrv_ms, u: 'ms' },
              { l: 'Resting HR', v: selected.latest_wellness?.resting_hr, u: 'bpm' },
              { l: 'SpO2', v: selected.latest_wellness?.blood_oxygen, u: '%' },
              { l: 'Sleep perf', v: selected.latest_wellness?.sleep_perf, u: '%' },
              { l: 'Sleep debt', v: selected.latest_wellness?.sleep_debt, u: 'hrs' },
              { l: 'Deep sleep', v: selected.latest_wellness?.deep_sleep, u: 'hrs' },
              { l: 'REM sleep', v: selected.latest_wellness?.rem_sleep, u: 'hrs' },
              { l: 'Strain', v: selected.latest_wellness?.day_strain, u: '' },
              { l: 'Calories', v: selected.latest_wellness?.calories, u: '' },
              { l: 'Sleep eff', v: selected.latest_wellness?.sleep_eff, u: '%' },
              { l: 'Resp rate', v: selected.latest_wellness?.resp_rate, u: 'rpm' },
            ].map((m) => (
              <div key={m.l} style={{ background: '#001a33', border: '1px solid #0a3560', borderRadius: 7, padding: '10px 12px' }}>
                <div style={{ fontSize: 9, color: '#A5ACAF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{m.l}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>
                  {m.v ?? '—'}<span style={{ fontSize: 10, color: '#A5ACAF' }}>{m.u}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <div className="sec-label">Habits — June 9</div>
              {HABITS.map(([key, label]) => {
                const val = selected.latest_habits?.[key as keyof typeof selected.latest_habits]
                return (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #0a3560', fontSize: 11, color: '#A5ACAF' }}>
                    <span>{label}</span>
                    <Badge variant={val ? 'green' : 'red'}>{val ? 'Yes' : 'No'}</Badge>
                  </div>
                )
              })}
            </div>
            <div>
              <div className="sec-label">Workout</div>
              {selected.latest_workout?.activity ? (
                [
                  ['Activity', selected.latest_workout.activity],
                  ['Duration', `${selected.latest_workout.duration_min} min`],
                  ['Strain', String(selected.latest_workout.strain)],
                  ['Calories', String(selected.latest_workout.calories)],
                  ['Max HR', `${selected.latest_workout.max_hr} bpm`],
                  ['Avg HR', `${selected.latest_workout.avg_hr} bpm`],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #0a3560', fontSize: 11 }}>
                    <span style={{ color: '#A5ACAF' }}>{k}</span><strong>{v}</strong>
                  </div>
                ))
              ) : (
                <div style={{ color: '#A5ACAF', fontSize: 11, padding: '8px 0' }}>No workout logged</div>
              )}
              {selected.latest_habits?.notes && (
                <div style={{ marginTop: 8, padding: 10, background: '#001a33', border: '1px solid #0a3560', borderRadius: 6, fontSize: 10, color: '#A5ACAF' }}>
                  {selected.latest_habits.notes}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}
    </>
  )
}
