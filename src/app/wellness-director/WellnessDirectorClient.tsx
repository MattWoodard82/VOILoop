'use client'
import { useState, useMemo } from 'react'
import type { ParticipantWithWellness } from '@/types'
import { Card, Badge, BarRow } from '@/components/ui'
import { recoveryColor } from '@/lib/utils'
import { WellnessDirectorCharts } from './WellnessDirectorCharts'

interface Props {
  participants: ParticipantWithWellness[]
}

export function WellnessDirectorClient({ participants }: Props) {
  const [deptFilter, setDeptFilter] = useState('All')
  const [personFilter, setPersonFilter] = useState('All')

  const departments = useMemo(() => {
const depts = Array.from(new Set(participants.map(e => e.department))).sort()
    return ['All', ...depts]
  }, [participants])

  const filtered = useMemo(() => {
    let result = [...participants]
    if (deptFilter !== 'All') result = result.filter(e => e.department === deptFilter)
    if (personFilter !== 'All') result = result.filter(e => e.id === personFilter)
    return result
  }, [participants, deptFilter, personFilter])

  const deptAverages = useMemo(() => {
    if (personFilter !== 'All') return null
    const map: Record<string, number[]> = {}
    participants.forEach(e => {
      const score = e.latest_wellness?.recovery_score
      if (score) {
        if (!map[e.department]) map[e.department] = []
        map[e.department].push(score)
      }
    })
    return Object.entries(map).map(([dept, scores]) => ({
      dept,
      avg: Math.round(scores.reduce((a,b) => a+b, 0) / scores.length),
      count: scores.length,
    })).sort((a,b) => b.avg - a.avg)
  }, [participants, personFilter])

  const selectStyle = {
    background: '#001a33', border: '1px solid #0a3560', borderRadius: 6,
    padding: '6px 10px', fontSize: 11, color: '#fff',
    fontFamily: 'Inter, sans-serif', cursor: 'pointer',
  }

  const activePerson = personFilter !== 'All' ? filtered[0] : null

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, padding: '12px 16px', background: '#002244', border: '1px solid #0a3560', borderRadius: 10 }}>
        <span style={{ fontSize: 11, color: '#A5ACAF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filter by</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#A5ACAF' }}>Department:</span>
          <select value={deptFilter} onChange={e => { setDeptFilter(e.target.value); setPersonFilter('All') }} style={selectStyle}>
            {departments.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#A5ACAF' }}>Person:</span>
          <select value={personFilter} onChange={e => setPersonFilter(e.target.value)} style={selectStyle}>
            <option value="All">All participants</option>
            {participants
              .filter(e => deptFilter === 'All' || e.department === deptFilter)
              .map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
          </select>
        </div>
        {(deptFilter !== 'All' || personFilter !== 'All') && (
          <button onClick={() => { setDeptFilter('All'); setPersonFilter('All') }}
            style={{ marginLeft: 'auto', fontSize: 11, color: '#69BE28', background: 'transparent', border: '1px solid rgba(105,190,40,0.3)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
            Clear filters ×
          </button>
        )}
        <span style={{ marginLeft: deptFilter === 'All' && personFilter === 'All' ? 'auto' : 4, fontSize: 11, color: '#A5ACAF' }}>
          Showing <strong style={{ color: '#fff' }}>{filtered.length}</strong> of {participants.length} participants
        </span>
      </div>

      {activePerson && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 18 }}>
          {[
            { label: 'Recovery score', value: activePerson.latest_wellness?.recovery_score ?? '—', color: recoveryColor(activePerson.latest_wellness?.recovery_score ?? null) },
            { label: 'HRV', value: activePerson.latest_wellness?.hrv_ms ? `${activePerson.latest_wellness.hrv_ms}ms` : '—', color: '#69BE28' },
            { label: 'Sleep performance', value: activePerson.latest_wellness?.sleep_perf ? `${activePerson.latest_wellness.sleep_perf}%` : '—', color: '#A5ACAF' },
            { label: 'Day strain', value: activePerson.latest_wellness?.day_strain ?? '—', color: '#FFA500' },
            { label: 'Sleep debt', value: activePerson.latest_wellness?.sleep_debt ? `${activePerson.latest_wellness.sleep_debt}hrs` : '—', color: '#ff6b6b' },
            { label: 'Resting HR', value: activePerson.latest_wellness?.resting_hr ? `${activePerson.latest_wellness.resting_hr}bpm` : '—', color: '#A5ACAF' },
            { label: 'Deep sleep', value: activePerson.latest_wellness?.deep_sleep ? `${activePerson.latest_wellness.deep_sleep}hrs` : '—', color: '#69BE28' },
            { label: 'REM sleep', value: activePerson.latest_wellness?.rem_sleep ? `${activePerson.latest_wellness.rem_sleep}hrs` : '—', color: '#69BE28' },
          ].map(m => (
            <div key={m.label} style={{ background: '#001a33', border: '1px solid #0a3560', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 9, color: '#A5ACAF', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 6 }}>{m.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: m.color }}>{m.value}</div>
            </div>
          ))}
        </div>
      )}

      {deptAverages && deptFilter === 'All' && personFilter === 'All' && (
        <div style={{ marginBottom: 18 }}>
          <Card title="Recovery by department">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              {deptAverages.map(d => (
                <div key={d.dept} onClick={() => setDeptFilter(d.dept)}
                  style={{ background: '#001a33', border: '1px solid #0a3560', borderRadius: 8, padding: '12px 14px', cursor: 'pointer', transition: 'border .12s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#69BE28')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#0a3560')}>
                  <div style={{ fontSize: 11, color: '#A5ACAF', marginBottom: 6 }}>{d.dept}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: recoveryColor(d.avg), marginBottom: 4 }}>{d.avg}</div>
                  <div style={{ height: 4, background: '#0a3560', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${d.avg}%`, height: '100%', background: recoveryColor(d.avg), borderRadius: 2 }} />
                  </div>
                  <div style={{ fontSize: 10, color: '#A5ACAF', marginTop: 6 }}>{d.count} participant{d.count !== 1 ? 's' : ''} · click to filter</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14, marginBottom: 14 }}>
        <Card title={`Recovery scores — ${deptFilter !== 'All' ? deptFilter : personFilter !== 'All' ? filtered[0]?.first_name : 'all participants'}`}
          badge={<Badge variant="wolf">{filtered.length} participant{filtered.length !== 1 ? 's' : ''}</Badge>}>
          <WellnessDirectorCharts
            type="recovery"
            data={filtered.map(e => ({
              name: e.first_name + (e.is_exact_data ? ' ★' : ''),
              value: e.latest_wellness?.recovery_score ?? 0,
              color: recoveryColor(e.latest_wellness?.recovery_score ?? null),
            }))}
          />
        </Card>
      <Card title="Risk by department">
  {Object.entries(
    filtered.reduce((acc, e) => {
      const dept = e.department ?? 'Unknown'
      const score = e.latest_wellness?.recovery_score ?? 0
      if (!acc[dept]) acc[dept] = { total: 0, count: 0 }
      acc[dept].total += score
      acc[dept].count += 1
      return acc
    }, {} as Record<string, { total: number; count: number }>)
  )
    .map(([dept, { total, count }]) => ({ dept, avg: Math.round(total / count) }))
    .sort((a, b) => a.avg - b.avg)
    .map(({ dept, avg }) => (
      <BarRow
        key={dept}
        label={dept}
        value={avg}
        color={recoveryColor(avg)}
      />
    ))
  }
</Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <Card title="HRV (ms)">
          <WellnessDirectorCharts type="hrv" data={filtered.map(e => ({
            name: e.first_name,
            value: e.latest_wellness?.hrv_ms ?? 0,
            color: e.is_exact_data ? '#69BE28' : '#A5ACAF',
          }))} />
        </Card>
        <Card title="Day strain">
          <WellnessDirectorCharts type="strain" data={filtered.map(e => ({
            name: e.first_name,
            value: e.latest_wellness?.day_strain ?? 0,
            color: (e.latest_wellness?.day_strain ?? 0) > 14 ? '#ff6b6b' : (e.latest_wellness?.day_strain ?? 0) > 10 ? '#FFA500' : '#69BE28',
          }))} />
        </Card>
        <Card title="Sleep debt flags">
        {[...filtered]
            .sort((a,b) => (b.latest_wellness?.sleep_debt ?? 0) - (a.latest_wellness?.sleep_debt ?? 0))
            .map(e => {
              const debt = e.latest_wellness?.sleep_debt ?? 0
              return (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #0a3560', fontSize: 11 }}>
                  <span style={{ color: '#A5ACAF' }}>{e.first_name}{e.is_exact_data ? ' ★' : ''}</span>
                  <Badge variant={debt > 1.5 ? 'red' : debt > 0.8 ? 'amber' : 'green'}>
                    {debt === 0 ? 'On target' : `${debt}hrs`}
                  </Badge>
                </div>
              )
            })}
        </Card>
      </div>
    </>
  )
}
