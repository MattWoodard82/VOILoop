'use client'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { WhoopImportClient } from '@/app/admin/import/WhoopImportClient'
import type { Employee, DailyWellness, Habit, Workout, PulseSurvey } from '@/types'
import { SignOutButton } from '@/components/auth/SignOutButton'

interface Props {
  employee: Employee
  userEmail: string
  wellness: DailyWellness[]
  habits: Habit | null
  workout: Workout | null
  pulse: PulseSurvey[]
  challenge: {
    visibility_state: 'none' | 'ineligible' | 'eligible'
    data: {
      id: string
      name: string
      threshold_value: number
      progress_value: number
      completed: boolean
      completed_at: string | null
      last_computed_at: string | null
      status: 'active' | 'cancelled' | 'completed' | 'draft'
    } | null
  } | null
}

function scoreColor(v: number | null, type: 'recovery' | 'sleep' = 'recovery') {
  if (!v) return '#A5ACAF'
  const threshold = type === 'recovery' ? [67, 34] : [85, 65]
  if (v >= threshold[0]) return '#69BE28'
  if (v >= threshold[1]) return '#FFA500'
  return '#ff6b6b'
}

function MetricCard({ label, value, unit, color }: { label: string; value: any; unit?: string; color?: string }) {
  return (
    <div style={{ background: '#001a33', border: '1px solid #0a3560', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 9, color: '#A5ACAF', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || '#fff', lineHeight: 1 }}>
        {value ?? '—'}<span style={{ fontSize: 11, color: '#A5ACAF', marginLeft: 2 }}>{unit}</span>
      </div>
    </div>
  )
}

function HabitPill({ label, value }: { label: string; value: boolean | null }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 11, padding: '4px 10px', borderRadius: 20,
      fontWeight: value ? 600 : 400, marginRight: 6, marginBottom: 6,
      background: value ? 'rgba(105,190,40,0.12)' : 'rgba(165,172,175,0.08)',
      color: value ? '#69BE28' : '#A5ACAF',
      border: `1px solid ${value ? 'rgba(105,190,40,0.3)' : '#0a3560'}`,
    }}>
      {value ? '✓' : '–'} {label}
    </span>
  )
}

export function MyDashboardClient({ employee, userEmail, wellness, habits, workout, pulse, challenge }: Props) {
  const latest = wellness[0]
  const rc = latest?.recovery_score ?? null
  const recoveryColor = scoreColor(rc, 'recovery')

  const trendData = [...wellness].reverse().map(w => ({
    date: w.date.slice(5),
    recovery: w.recovery_score,
    sleep: w.sleep_perf,
  }))

  return (
    <div style={{ minHeight: '100vh', background: '#0d1f35', fontFamily: 'Inter, sans-serif' }}>

      <div style={{ background: '#002244', borderBottom: '1px solid #0a3560', padding: '0 24px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="28" height="28" viewBox="0 0 36 36" fill="none">
            <circle cx="18" cy="18" r="14" stroke="#0a3560" strokeWidth="2.5"/>
            <path d="M18,4 A14,14 0 0,1 31,21" stroke="#69BE28" strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M31,21 A14,14 0 0,1 18,32" stroke="#69BE28" strokeWidth="1.8" strokeLinecap="round" opacity="0.65"/>
            <circle cx="18" cy="18" r="6" fill="#001a33"/>
          </svg>
          <div>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#69BE28' }}>VOI</span>
            <span style={{ fontWeight: 300, fontSize: 14, color: '#fff' }}>Loop</span>
          </div>
          <span style={{ fontSize: 11, color: '#0a3560', margin: '0 4px' }}>|</span>
          <span style={{ fontSize: 12, color: '#A5ACAF' }}>My Wellness</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: '#A5ACAF' }}>{userEmail}</span>
          <SignOutButton />
        </div>
      </div>

      <div style={{ padding: '20px 24px', maxWidth: 900, margin: '0 auto' }}>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {employee.first_name} 👋
          </div>

          {challenge && challenge.visibility_state !== 'none' && challenge.data && (
            <div style={{ background: '#002244', border: '1px solid #0a3560', borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{challenge.data.name}</div>
                <div style={{ fontSize: 10, color: '#A5ACAF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Challenge
                </div>
              </div>
              {challenge.visibility_state === 'ineligible' ? (
                <div style={{ fontSize: 12, color: '#A5ACAF' }}>
                  You are not eligible for the current active challenge.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: '#A5ACAF', marginBottom: 8 }}>
                    Progress: <strong style={{ color: '#fff' }}>{challenge.data.progress_value}</strong> / {challenge.data.threshold_value}
                  </div>
                  <div style={{ height: 7, background: '#0a3560', borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
                    <div
                      style={{
                        width: `${Math.min((challenge.data.progress_value / challenge.data.threshold_value) * 100, 100)}%`,
                        height: '100%',
                        background: challenge.data.completed ? '#69BE28' : '#378ADD',
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: challenge.data.completed ? '#69BE28' : '#A5ACAF' }}>
                    {challenge.data.completed
                      ? `Completed ${challenge.data.completed_at ? new Date(challenge.data.completed_at).toLocaleString() : ''}`
                      : 'In progress'}
                    {challenge.data.last_computed_at ? ` · Updated ${new Date(challenge.data.last_computed_at).toLocaleString()}` : ''}
                  </div>
                </>
              )}
            </div>
          )}
          <div style={{ fontSize: 13, color: '#A5ACAF' }}>{employee.department} · {employee.title}</div>
        </div>

        {latest && (
          <div style={{ background: '#002244', border: `1px solid ${rc && rc >= 67 ? 'rgba(105,190,40,0.3)' : rc && rc >= 34 ? 'rgba(255,165,0,0.3)' : 'rgba(255,107,107,0.3)'}`, borderRadius: 12, padding: '20px 24px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ textAlign: 'center', flex: '0 0 100px' }}>
              <div style={{ fontSize: 9, color: '#A5ACAF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Recovery score</div>
              <div style={{ fontSize: 52, fontWeight: 700, color: recoveryColor, lineHeight: 1 }}>{rc ?? '—'}</div>
              <div style={{ fontSize: 11, color: recoveryColor, marginTop: 4, fontWeight: 500 }}>
                {rc && rc >= 67 ? '✓ Green — ready to perform' : rc && rc >= 34 ? '⚡ Yellow — moderate' : '⚠ Red — rest recommended'}
              </div>
            </div>
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              <MetricCard label="HRV" value={latest.hrv_ms} unit="ms" color="#69BE28" />
              <MetricCard label="Resting HR" value={latest.resting_hr} unit="bpm" />
              <MetricCard label="Sleep" value={latest.sleep_perf} unit="%" color={scoreColor(latest.sleep_perf, 'sleep')} />
              <MetricCard label="Sleep debt" value={latest.sleep_debt} unit="hrs" color={(latest.sleep_debt ?? 0) > 1 ? '#ff6b6b' : '#69BE28'} />
              <MetricCard label="Day strain" value={latest.day_strain} color={(latest.day_strain ?? 0) > 14 ? '#ff6b6b' : (latest.day_strain ?? 0) > 10 ? '#FFA500' : '#69BE28'} />
              <MetricCard label="Deep sleep" value={latest.deep_sleep} unit="hrs" />
              <MetricCard label="REM sleep" value={latest.rem_sleep} unit="hrs" />
              <MetricCard label="Resp rate" value={latest.resp_rate} unit="rpm" />
            </div>
          </div>
        )}

        {trendData.length > 1 && (
          <div style={{ background: '#002244', border: '1px solid #0a3560', borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 12 }}>Recovery & Sleep trend</div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={trendData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                <CartesianGrid stroke="rgba(10,53,96,0.6)" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: '#A5ACAF', fontSize: 10, fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#A5ACAF', fontSize: 10, fontFamily: 'Inter' }} axisLine={false} tickLine={false} width={28} domain={[0, 100]} />
                <Tooltip contentStyle={{ background: '#001a33', border: '1px solid #0a3560', borderRadius: 6, fontSize: 11 }} labelStyle={{ color: '#fff' }} />
                <Line type="monotone" dataKey="recovery" stroke="#69BE28" strokeWidth={2} dot={{ r: 3, fill: '#69BE28' }} name="Recovery" />
                <Line type="monotone" dataKey="sleep" stroke="#378ADD" strokeWidth={2} dot={{ r: 3, fill: '#378ADD' }} name="Sleep %" strokeDasharray="4 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          {habits && (
            <div style={{ background: '#002244', border: '1px solid #0a3560', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 10 }}>Today&apos;s habits</div>
              <div>
                <HabitPill label="Hydrated" value={habits.hydrated} />
                <HabitPill label="Protein" value={habits.protein} />
                <HabitPill label="Caffeine" value={habits.caffeine} />
                <HabitPill label="Ate late" value={habits.ate_late} />
                <HabitPill label="Alcohol" value={habits.alcohol} />
                <HabitPill label="Magnesium" value={habits.magnesium} />
                <HabitPill label="Creatine" value={habits.creatine} />
                <HabitPill label="Dimmed lights" value={habits.dimmed_lights} />
                <HabitPill label="Read before bed" value={habits.read_before_bed} />
              </div>
              {habits.notes && (
                <div style={{ marginTop: 10, padding: '8px 10px', background: '#001a33', borderRadius: 6, fontSize: 11, color: '#A5ACAF' }}>
                  {habits.notes}
                </div>
              )}
            </div>
          )}

          {workout && (
            <div style={{ background: '#002244', border: '1px solid #0a3560', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 10 }}>Latest workout</div>
              {[
                ['Activity', workout.activity],
                ['Duration', workout.duration_min ? `${workout.duration_min} min` : '—'],
                ['Strain', workout.strain],
                ['Calories', workout.calories],
                ['Max HR', workout.max_hr ? `${workout.max_hr} bpm` : '—'],
                ['Avg HR', workout.avg_hr ? `${workout.avg_hr} bpm` : '—'],
              ].map(([k, v]) => (
                <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #0a3560', fontSize: 12 }}>
                  <span style={{ color: '#A5ACAF' }}>{k}</span>
                  <strong style={{ color: '#fff' }}>{v || '—'}</strong>
                </div>
              ))}
            </div>
          )}
        </div>

        {pulse.length > 0 && (
          <div style={{ background: '#002244', border: '1px solid #0a3560', borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 12 }}>Your pulse survey scores</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {[
                { label: 'Wellbeing', key: 'wellbeing_score' as const },
                { label: 'Burnout', key: 'burnout_score' as const },
                { label: 'Manager support', key: 'manager_support' as const },
                { label: 'Work-life balance', key: 'work_life_balance' as const },
              ].map(m => {
                const v = pulse[0][m.key]
                const c = v ? (v >= 7 ? '#69BE28' : v >= 5 ? '#FFA500' : '#ff6b6b') : '#A5ACAF'
                return (
                  <div key={m.key} style={{ background: '#001a33', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, color: '#A5ACAF', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: c }}>{v ?? '—'}<span style={{ fontSize: 10, color: '#A5ACAF' }}>/10</span></div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div style={{ background: '#002244', border: '1px solid #0a3560', borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 6 }}>Upload your WHOOP export</div>
          <div style={{ fontSize: 11, color: '#A5ACAF', marginBottom: 16, lineHeight: 1.6 }}>
            Upload the latest WHOOP workbook tied to your account to refresh your recovery, sleep, strain, and habit data.
          </div>
          <WhoopImportClient />
        </div>

        <div style={{ background: 'rgba(105,190,40,0.06)', border: '1px solid rgba(105,190,40,0.2)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 3 }}>Monthly pulse survey</div>
            <div style={{ fontSize: 11, color: '#A5ACAF' }}>Not available in this pilot.</div>
          </div>
          <button
            type="button"
            disabled
            title="not available in this pilot"
            style={{ background: '#0a3560', color: '#A5ACAF', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 12, fontWeight: 700, cursor: 'not-allowed', fontFamily: 'Inter, sans-serif', opacity: 0.8 }}
          >
            Take survey →
          </button>
        </div>

      </div>
    </div>
  )
}
