import { DashboardShell } from '@/components/layout/DashboardShell'
import { getTeamDashboard, getLatestPulse } from '@/lib/supabase/queries'
import { KpiCard, Card, Badge } from '@/components/ui'
import { initials, safeAvg } from '@/lib/utils'
import { requireAuth } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { PulseSurvey } from '@/types'

export const dynamic = 'force-dynamic'

function countSelectedActivity(pulse: PulseSurvey[], activity: string) {
  return pulse.filter((entry) => entry.physical_activity?.includes(activity)).length
}

function countWhoopReviewed(pulse: PulseSurvey[], value: PulseSurvey['whoop_reviewed']) {
  return pulse.filter((entry) => entry.whoop_reviewed === value).length
}

function countProgramSupport(pulse: PulseSurvey[], value: PulseSurvey['program_supported']) {
  return pulse.filter((entry) => entry.program_supported === value).length
}

function countHealthFlags(pulse: PulseSurvey[]) {
  return pulse.filter((entry) => typeof entry.health_flag === 'string' && entry.health_flag.trim().length > 0).length
}

export default async function PulsePage() {
  const access = await requireAuth()
  if ('redirect' in access && access.redirect) redirect(access.redirect)
  if (!access.role || !['admin', 'wellness_director'].includes(access.role)) redirect('/my')

  const [{ participants }, pulse] = await Promise.all([
    getTeamDashboard(),
    getLatestPulse(),
  ])

  const pulseMap = Object.fromEntries(pulse.map((p) => [p.participant_id, p]))
  const pulseCounts = pulse.reduce<Record<string, number>>((acc, row) => {
    acc[row.participant_id] = (acc[row.participant_id] ?? 0) + 1
    return acc
  }, {})
  const responded = pulse.length
  const avgMentalWellbeing = safeAvg(pulse.map((p) => p.mental_wellbeing))
  const avgEnergy = safeAvg(pulse.map((p) => p.energy_level))
  const pctConfident = responded > 0
    ? Math.round((pulse.filter((p) => p.confident_health === true).length / responded) * 100)
    : 0
  const pctWhoopReviewed = responded > 0
    ? Math.round((pulse.filter((p) => p.whoop_reviewed && p.whoop_reviewed !== 'no').length / responded) * 100)
    : 0
  const flaggedResponses = countHealthFlags(pulse)

  const scale5Questions = [
    { label: 'Energy levels', key: 'energy_level' as const },
    { label: 'Rest quality', key: 'rest_quality' as const },
    { label: 'Stress levels (lower = better)', key: 'stress_level' as const },
    { label: 'Mental wellbeing', key: 'mental_wellbeing' as const },
  ]

  const activityBreakdown = [
    { label: 'Fitness center', key: 'fitness_center' },
    { label: 'Outside', key: 'outside' },
    { label: 'Local gym', key: 'local_gym' },
    { label: 'Home gym', key: 'home_gym' },
    { label: 'None', key: 'none' },
  ]

  const now = new Date()
  const utcDay = now.getUTCDay()
  const diffToMonday = utcDay === 0 ? -6 : 1 - utcDay
  const weekMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diffToMonday))
  const weekSunday = new Date(Date.UTC(weekMonday.getUTCFullYear(), weekMonday.getUTCMonth(), weekMonday.getUTCDate() + 6))
  const weekLabel = `${weekMonday.toISOString().slice(5, 10).replace('-', '/')} – ${weekSunday.toISOString().slice(5, 10).replace('-', '/')}`

  return (
    <DashboardShell title="Pulse Survey Dashboard" period={weekLabel}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 18 }}>
        <KpiCard label="Response rate" value={`${Math.round((responded / participants.length) * 100)}%`} color="#69BE28" delta={`${responded} of ${participants.length} responded this week`} deltaDir="up" />
        <KpiCard label="Avg mental wellbeing" value={`${avgMentalWellbeing}/5`} color="#fff" delta={responded > 0 ? 'This week\'s average' : 'No responses yet'} deltaDir="neutral" />
        <KpiCard label="Avg energy level" value={`${avgEnergy}/5`} color="#69BE28" delta={responded > 0 ? 'This week\'s average' : 'No responses yet'} deltaDir="neutral" />
        <KpiCard label="Confident about health" value={`${pctConfident}%`} color="#fff" delta={responded > 0 ? 'Said true this week' : 'No responses yet'} deltaDir="neutral" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 18 }}>
        <KpiCard label="WHOOP reviewed" value={`${pctWhoopReviewed}%`} color="#69BE28" delta={responded > 0 ? 'Reviewed at least once' : 'No responses yet'} deltaDir="neutral" />
        <KpiCard label="Health flags raised" value={String(flaggedResponses)} color={flaggedResponses > 0 ? '#FFA500' : '#fff'} delta={responded > 0 ? 'Responses with free-text flag' : 'No responses yet'} deltaDir="neutral" />
        <KpiCard label="Supportive sentiment" value={`${responded > 0 ? Math.round((countProgramSupport(pulse, 'yes') / responded) * 100) : 0}%`} color="#69BE28" delta={responded > 0 ? 'Program supported = yes' : 'No responses yet'} deltaDir="neutral" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <Card title="Mental wellbeing by participant" badge={<Badge variant="wolf">{responded} responses</Badge>}>
          {[...participants]
            .filter((e) => pulseMap[e.id])
            .sort((a, b) => (pulseMap[b.id]?.mental_wellbeing ?? 0) - (pulseMap[a.id]?.mental_wellbeing ?? 0))
            .map((e) => {
              const score = pulseMap[e.id]?.mental_wellbeing ?? 0
              const count = pulseCounts[e.id] ?? 0
              const color = score >= 4 ? '#69BE28' : score >= 3 ? '#FFA500' : '#ff6b6b'
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#1a4a2e', color: '#69BE28', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
                    {initials(e.first_name, e.last_name)}
                  </div>
                  <span style={{ width: 100, fontSize: 11, color: '#A5ACAF' }}>
                    {e.first_name}{e.is_exact_data ? ' ★' : ''}
                  </span>
                  <div style={{ flex: 1, height: 5, background: '#0a3560', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${score * 20}%`, height: '100%', background: color, borderRadius: 3 }} />
                  </div>
                  <span style={{ width: 24, textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#A5ACAF' }}>{count}</span>
                  <span style={{ width: 24, textAlign: 'right', fontSize: 11, fontWeight: 700, color }}>{score}</span>
                </div>
              )
            })}
        </Card>

        <Card title="Question breakdown">
          {scale5Questions.map((q) => {
            const avg = safeAvg(pulse.map((p) => p[q.key]))
            const isStress = q.key === 'stress_level'
            const color = isStress
              ? (avg <= 2 ? '#69BE28' : avg <= 3 ? '#FFA500' : '#ff6b6b')
              : (avg >= 4 ? '#69BE28' : avg >= 3 ? '#FFA500' : '#ff6b6b')
            return (
              <div key={q.key} style={{ padding: '8px 0', borderBottom: '1px solid #0a3560' }}>
                <div style={{ fontSize: 11, color: '#fff', marginBottom: 5 }}>{q.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 5, background: '#0a3560', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${avg * 20}%`, height: '100%', background: color, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, width: 24, color }}>{avg}</span>
                </div>
              </div>
            )
          })}
          {/* Boolean questions */}
          {responded > 0 && (
            <>
              {[
                { label: 'Confident about health/progress', key: 'confident_health' as const },
                { label: 'Body/results trending well', key: 'body_trending_good' as const },
              ].map((q) => {
                const pct = Math.round((pulse.filter((p) => p[q.key] === true).length / responded) * 100)
                const color = pct >= 70 ? '#69BE28' : pct >= 50 ? '#FFA500' : '#ff6b6b'
                return (
                  <div key={q.key} style={{ padding: '8px 0', borderBottom: '1px solid #0a3560' }}>
                    <div style={{ fontSize: 11, color: '#fff', marginBottom: 5 }}>{q.label}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 5, background: '#0a3560', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, width: 32, color }}>{pct}%</span>
                    </div>
                  </div>
                )
              })}
              {/* Program supported distribution */}
              <div style={{ padding: '8px 0', borderBottom: '1px solid #0a3560' }}>
                <div style={{ fontSize: 11, color: '#fff', marginBottom: 5 }}>Program supported wellbeing</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(['yes', 'neutral', 'no'] as const).map((opt) => {
                    const count = countProgramSupport(pulse, opt)
                    const color = opt === 'yes' ? '#69BE28' : opt === 'neutral' ? '#FFA500' : '#ff6b6b'
                    return (
                      <span key={opt} style={{ fontSize: 10, color, fontWeight: 600 }}>
                        {opt.charAt(0).toUpperCase() + opt.slice(1)}: {count}
                      </span>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card title="Activity & WHOOP review">
          {activityBreakdown.map((activity) => {
            const count = countSelectedActivity(pulse, activity.key)
            const pct = responded > 0 ? Math.round((count / responded) * 100) : 0
            return (
              <div key={activity.key} style={{ padding: '8px 0', borderBottom: '1px solid #0a3560' }}>
                <div style={{ fontSize: 11, color: '#fff', marginBottom: 5 }}>{activity.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 5, background: '#0a3560', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: '#69BE28', borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, width: 32, color: '#69BE28' }}>{pct}%</span>
                </div>
              </div>
            )
          })}

          <div style={{ padding: '10px 0 0' }}>
            <div style={{ fontSize: 11, color: '#fff', marginBottom: 5 }}>WHOOP reviewed</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: '#69BE28', fontWeight: 600 }}>Regularly: {countWhoopReviewed(pulse, 'yes_regularly')}</span>
              <span style={{ fontSize: 10, color: '#FFA500', fontWeight: 600 }}>Once: {countWhoopReviewed(pulse, 'yes_once')}</span>
              <span style={{ fontSize: 10, color: '#A5ACAF', fontWeight: 600 }}>No: {countWhoopReviewed(pulse, 'no')}</span>
            </div>
          </div>
        </Card>

        <Card title="Health flags">
          {flaggedResponses === 0 ? (
            <div style={{ fontSize: 12, color: '#A5ACAF' }}>No respondents added a health flag this week.</div>
          ) : (
            pulse
              .filter((entry) => typeof entry.health_flag === 'string' && entry.health_flag.trim().length > 0)
              .map((entry) => {
                const participant = participants.find((candidate) => candidate.id === entry.participant_id)
                const name = participant ? `${participant.first_name} ${participant.last_name}`.trim() : entry.participant_id
                return (
                  <div key={`${entry.participant_id}-${entry.date}`} style={{ padding: '10px 0', borderBottom: '1px solid #0a3560' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#4f3b12', color: '#FFA500', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
                        {participant ? initials(participant.first_name, participant.last_name) : 'HF'}
                      </div>
                      <div style={{ fontSize: 11, color: '#fff', fontWeight: 600 }}>{name}</div>
                      <div style={{ fontSize: 10, color: '#A5ACAF' }}>{entry.date}</div>
                    </div>
                    <div style={{ fontSize: 11, color: '#A5ACAF', lineHeight: 1.5 }}>{entry.health_flag}</div>
                  </div>
                )
              })
          )}
        </Card>
      </div>
    </DashboardShell>
  )
}
