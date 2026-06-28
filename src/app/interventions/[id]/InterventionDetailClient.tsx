'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import { createClient } from '@/lib/supabase/client'

interface Props {
  intervention: any
  employee: any
  wellness: any[]
  habits: any[]
  workouts: any[]
}

const STATUS_OPTIONS = ['Pending', 'In Progress', 'Monitoring', 'Resolved']

const statusColor = (s: string) => {
  if (s === 'Resolved') return '#69BE28'
  if (s === 'Monitoring') return '#A5ACAF'
  if (s === 'In Progress') return '#FFA500'
  return '#ff6b6b'
}

function MetricCard({ label, before, after, unit }: { label: string; before: any; after: any; unit?: string }) {
  const improved = after !== null && before !== null && after > before
  const worsened = after !== null && before !== null && after < before
  const arrow = improved ? '↑' : worsened ? '↓' : '→'
  const arrowColor = improved ? '#69BE28' : worsened ? '#ff6b6b' : '#A5ACAF'
  return (
    <div style={{ background: '#001a33', border: '1px solid #0a3560', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 9, color: '#A5ACAF', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: '#A5ACAF', marginBottom: 2 }}>Before</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#A5ACAF' }}>{before ?? '—'}{unit}</div>
        </div>
        <div style={{ fontSize: 18, color: arrowColor, fontWeight: 700 }}>{arrow}</div>
        <div>
          <div style={{ fontSize: 10, color: '#A5ACAF', marginBottom: 2 }}>Latest</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: arrowColor }}>{after ?? '—'}{unit}</div>
        </div>
      </div>
    </div>
  )
}

export function InterventionDetailClient({ intervention, employee, wellness, habits, workouts }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState(intervention.outcome ?? 'Pending')
  const [notes, setNotes] = useState(intervention.notes ?? '')
  const [wdNotes, setWdNotes] = useState(intervention.wd_notes ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const first = wellness[0]
  const latest = wellness[wellness.length - 1]

  const trendData = wellness.map(w => ({
    date: w.date?.slice(5) ?? '',
    recovery: w.recovery_score,
    sleep: w.sleep_perf,
    hrv: w.hrv_ms,
    strain: w.day_strain,
    sleepDebt: w.sleep_debt,
  }))

  const handleSave = async () => {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('interventions').update({
      outcome: status,
      notes,
      wd_notes: wdNotes,
      date_resolved: status === 'Resolved' ? new Date().toISOString().split('T')[0] : null,
    }).eq('id', intervention.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const inputStyle = {
    background: '#001a33', border: '1px solid #0a3560', borderRadius: 6,
    padding: '8px 10px', fontSize: 12, color: '#fff',
    fontFamily: 'Inter, sans-serif', width: '100%', boxSizing: 'border-box' as const,
  }
  const labelStyle = {
    fontSize: 10, color: '#A5ACAF', textTransform: 'uppercase' as const,
    letterSpacing: '0.06em', fontWeight: 600 as const, marginBottom: 4, display: 'block' as const,
  }

  return (
    <div>
      <button onClick={() => router.push('/interventions')}
        style={{ background: 'transparent', border: '1px solid #0a3560', borderRadius: 6, padding: '6px 12px', fontSize: 11, color: '#A5ACAF', cursor: 'pointer', fontFamily: 'Inter, sans-serif', marginBottom: 16 }}>
        ← Back to interventions
      </button>

      <div style={{ background: '#002244', border: '1px solid #0a3560', borderRadius: 10, padding: '18px 22px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
            {employee ? `${employee.first_name} ${employee.last_name}` : intervention.employee_id}
          </div>
          <div style={{ fontSize: 12, color: '#A5ACAF', marginBottom: 8 }}>
            {employee?.title} · {employee?.department}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', color: '#ff6b6b', padding: '3px 10px', borderRadius: 20, fontWeight: 500 }}>
              ⚠ {intervention.trigger_metric}: {intervention.trigger_value}
            </span>
            <span style={{ fontSize: 11, background: '#001a33', border: '1px solid #0a3560', color: '#A5ACAF', padding: '3px 10px', borderRadius: 20 }}>
              {intervention.intervention_type}
            </span>
            <span style={{ fontSize: 11, background: '#001a33', border: '1px solid #0a3560', color: '#A5ACAF', padding: '3px 10px', borderRadius: 20 }}>
              Triggered: {intervention.date_triggered ?? '—'}
            </span>
            <span style={{ fontSize: 11, background: '#001a33', border: '1px solid #0a3560', color: '#A5ACAF', padding: '3px 10px', borderRadius: 20 }}>
              Assigned to: {intervention.assigned_to ?? 'Wellness Director'}
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: '#A5ACAF', marginBottom: 4 }}>Current status</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: statusColor(status) }}>{status}</div>
        </div>
      </div>

      {wellness.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#A5ACAF', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, marginBottom: 10 }}>Biometric progress since intervention</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
            <MetricCard label="Recovery score" before={first?.recovery_score} after={latest?.recovery_score} />
            <MetricCard label="HRV" before={first?.hrv_ms} after={latest?.hrv_ms} unit="ms" />
            <MetricCard label="Sleep performance" before={first?.sleep_perf} after={latest?.sleep_perf} unit="%" />
            <MetricCard label="Sleep debt" before={first?.sleep_debt} after={latest?.sleep_debt} unit="hrs" />
            <MetricCard label="Resting HR" before={first?.resting_hr} after={latest?.resting_hr} unit="bpm" />
            <MetricCard label="Day strain" before={first?.day_strain} after={latest?.day_strain} />
            <MetricCard label="Deep sleep" before={first?.deep_sleep} after={latest?.deep_sleep} unit="hrs" />
            <MetricCard label="REM sleep" before={first?.rem_sleep} after={latest?.rem_sleep} unit="hrs" />
          </div>
        </div>
      )}

      {trendData.length > 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div style={{ background: '#002244', border: '1px solid #0a3560', borderRadius: 10, padding: '14px 18px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 12 }}>Recovery score trend</div>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={trendData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid stroke="rgba(10,53,96,0.6)" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: '#A5ACAF', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#A5ACAF', fontSize: 9 }} axisLine={false} tickLine={false} width={24} domain={[0, 100]} />
                <Tooltip contentStyle={{ background: '#001a33', border: '1px solid #0a3560', borderRadius: 6, fontSize: 11 }} />
                <ReferenceLine y={67} stroke="#69BE28" strokeDasharray="4 4" label={{ value: 'Green', fill: '#69BE28', fontSize: 9 }} />
                <ReferenceLine y={34} stroke="#ff6b6b" strokeDasharray="4 4" label={{ value: 'Red', fill: '#ff6b6b', fontSize: 9 }} />
                <Line type="monotone" dataKey="recovery" stroke="#69BE28" strokeWidth={2} dot={{ r: 3, fill: '#69BE28' }} name="Recovery" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ background: '#002244', border: '1px solid #0a3560', borderRadius: 10, padding: '14px 18px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 12 }}>Sleep debt & HRV trend</div>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={trendData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid stroke="rgba(10,53,96,0.6)" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: '#A5ACAF', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#A5ACAF', fontSize: 9 }} axisLine={false} tickLine={false} width={24} />
                <Tooltip contentStyle={{ background: '#001a33', border: '1px solid #0a3560', borderRadius: 6, fontSize: 11 }} />
                <Line type="monotone" dataKey="sleepDebt" stroke="#ff6b6b" strokeWidth={2} dot={{ r: 3, fill: '#ff6b6b' }} name="Sleep debt (hrs)" />
                <Line type="monotone" dataKey="hrv" stroke="#378ADD" strokeWidth={2} dot={{ r: 3, fill: '#378ADD' }} name="HRV (ms)" strokeDasharray="4 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {workouts.length > 0 && (
        <div style={{ background: '#002244', border: '1px solid #0a3560', borderRadius: 10, padding: '14px 18px', marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 10 }}>Workout activity since intervention</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {workouts.map((w, i) => (
              <div key={i} style={{ background: '#001a33', border: '1px solid #0a3560', borderRadius: 8, padding: '8px 12px', fontSize: 11 }}>
                <div style={{ color: '#69BE28', fontWeight: 600, marginBottom: 2 }}>{w.activity}</div>
                <div style={{ color: '#A5ACAF' }}>{w.date} · {w.duration_min}min · strain {w.strain}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: '#002244', border: '1px solid rgba(105,190,40,0.3)', borderRadius: 10, padding: '18px 22px', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#69BE28', marginBottom: 16 }}>Wellness Director — Action Panel</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Update status</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STATUS_OPTIONS.map(s => (
                <button key={s} onClick={() => setStatus(s)}
                  style={{
                    padding: '6px 14px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif', border: '1px solid',
                    borderColor: status === s ? statusColor(s) : '#0a3560',
                    background: status === s ? `${statusColor(s)}22` : '#001a33',
                    color: status === s ? statusColor(s) : '#A5ACAF',
                    fontWeight: status === s ? 700 : 400,
                  }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Recommended action / notes (visible to admin)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="e.g. Schedule 1:1 check-in, recommend sleep hygiene program..."
              style={{ ...inputStyle, resize: 'vertical' as const }} />
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Wellness Director clinical notes (private)</label>
          <textarea value={wdNotes} onChange={e => setWdNotes(e.target.value)} rows={3}
            placeholder="Private notes about this employee — not visible to the COO..."
            style={{ ...inputStyle, resize: 'vertical' as const }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={handleSave} disabled={saving}
            style={{
              background: saving ? '#0a3560' : '#69BE28', color: saving ? '#A5ACAF' : '#002244',
              border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 13, fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif',
            }}>
            {saving ? 'Saving...' : status === 'Resolved' ? '✅ Mark resolved & save' : '💾 Save changes'}
          </button>
          {saved && <span style={{ fontSize: 12, color: '#69BE28' }}>✓ Saved successfully</span>}
        </div>
      </div>

      {wellness.length === 0 && (
        <div style={{ background: '#002244', border: '1px solid #0a3560', borderRadius: 10, padding: '24px', textAlign: 'center', color: '#A5ACAF', fontSize: 13 }}>
          No biometric data recorded since this intervention was triggered. Upload WHOOP data via /admin to see progress here.
        </div>
      )}
    </div>
  )
}
