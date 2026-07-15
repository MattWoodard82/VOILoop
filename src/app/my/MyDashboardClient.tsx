'use client'

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts'
import { WhoopImportClient } from '@/app/admin/import/WhoopImportClient'
import { Alert, Badge, Card, KpiCard } from '@/components/ui'
import { formatDate, recoveryColor, sleepColor } from '@/lib/utils'
import type { DailyWellness, Employee, Habit, ImportBatch, PulseSurvey, Workout } from '@/types'
import { EventsNudgeCard } from '@/components/EventsNudgeCard'

interface Props {
  employee: Employee
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
  importBatches: ImportBatch[]
}

function getRecoverySummary(score: number | null) {
  if (score == null) {
    return { label: 'No recovery data yet', detail: 'Upload a WHOOP export to populate your dashboard.' }
  }

  if (score >= 67) {
    return { label: 'Green recovery', detail: 'You look ready for a higher-load day.' }
  }

  if (score >= 34) {
    return { label: 'Yellow recovery', detail: 'Moderate readiness. Keep an eye on sleep debt and strain.' }
  }

  return { label: 'Red recovery', detail: 'Recovery is low today. Prioritize rest and lower-intensity activity.' }
}

function recoveryBadgeVariant(score: number | null): 'green' | 'amber' | 'red' | 'wolf' {
  if (score == null) return 'wolf'
  if (score >= 67) return 'green'
  if (score >= 34) return 'amber'
  return 'red'
}

function statusVariant(status: ImportBatch['status']) {
  if (status === 'completed') return 'green'
  if (status === 'partial' || status === 'processing' || status === 'pending') return 'amber'
  return 'red'
}

function statusLabel(status: ImportBatch['status']) {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function MetricRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid #0a3560', fontSize: 12 }}>
      <span style={{ color: '#A5ACAF' }}>{label}</span>
      <strong style={{ color: '#fff', textAlign: 'right' }}>{value}</strong>
    </div>
  )
}

function HabitBadge({ label, value }: { label: string; value: boolean | null }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        border: `1px solid ${value ? 'rgba(105,190,40,0.3)' : '#0a3560'}`,
        background: value ? 'rgba(105,190,40,0.1)' : '#001a33',
        color: value ? '#69BE28' : '#A5ACAF',
        fontSize: 11,
        marginRight: 6,
        marginBottom: 6,
      }}
    >
      <span>{value ? '✓' : '–'}</span>
      {label}
    </span>
  )
}

export function MyDashboardClient({ employee, wellness, habits, workout, pulse, challenge, importBatches }: Props) {
  const latest = wellness[0] ?? null
  const latestPulse = pulse[0] ?? null
  const latestImport = importBatches[0] ?? null
  const recoverySummary = getRecoverySummary(latest?.recovery_score ?? null)

  const trendData = [...wellness]
    .reverse()
    .map((entry) => ({
      date: entry.date.slice(5),
      recovery: entry.recovery_score,
      sleep: entry.sleep_perf,
      strain: entry.day_strain,
    }))

  const pulseTrendData = [...pulse]
    .reverse()
    .map((entry) => ({
      date: entry.date.slice(5),
      wellbeing: entry.wellbeing_score,
      burnout: entry.burnout_score,
      energy: entry.energy_score,
    }))

  const importSyncLabel = latestImport?.completed_at
    ? formatDate(latestImport.completed_at)
    : latestImport?.started_at
      ? formatDate(latestImport.started_at)
      : latest?.date
        ? formatDate(latest.date)
        : null

  return (
    <div>
      {!latest ? (
        <Alert variant="warn">
          <strong style={{ color: '#fff' }}>Your dashboard is waiting for data.</strong> Upload a WHOOP export to populate recovery, sleep, strain, and habit insights.
        </Alert>
      ) : null}

      <div
        style={{
          background: '#002244',
          border: `1px solid ${recoveryColor(latest?.recovery_score ?? null)}`,
          borderRadius: 12,
          padding: '20px 24px',
          marginBottom: 18,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 20,
          alignItems: 'flex-start',
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {employee.first_name}
          </div>
          <div style={{ fontSize: 13, color: '#A5ACAF', marginBottom: 12 }}>
            {employee.department} · {employee.title}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: recoveryColor(latest?.recovery_score ?? null), marginBottom: 4 }}>
            {recoverySummary.label}
          </div>
          <div style={{ fontSize: 12, color: '#A5ACAF', maxWidth: 560, lineHeight: 1.6 }}>
            {recoverySummary.detail}
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
          <Badge variant={recoveryBadgeVariant(latest?.recovery_score ?? null)}>
            Recovery {latest?.recovery_score ?? '—'}
          </Badge>
          <Badge variant="wolf">
            {importSyncLabel ? `Last sync ${importSyncLabel}` : 'No sync yet'}
          </Badge>
          {employee.is_exact_data ? <Badge variant="green">Exact WHOOP data</Badge> : null}
        </div>
      </div>

      {challenge && challenge.visibility_state !== 'none' && challenge.data ? (
        <Card title="Challenge progress" badge={<Badge variant={challenge.data.completed ? 'green' : 'wolf'}>{challenge.data.status}</Badge>}>
          <div style={{ fontSize: 12, color: '#A5ACAF', marginBottom: 8, lineHeight: 1.5 }}>
            <strong style={{ color: '#fff' }}>{challenge.data.name}</strong>
          </div>
          {challenge.visibility_state === 'ineligible' ? (
            <div style={{ fontSize: 12, color: '#A5ACAF' }}>
              You are not eligible for the current challenge.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: '#A5ACAF', marginBottom: 8 }}>
                Progress: <strong style={{ color: '#fff' }}>{challenge.data.progress_value}</strong> / {challenge.data.threshold_value}
              </div>
              <div style={{ height: 8, background: '#0a3560', borderRadius: 999, overflow: 'hidden', marginBottom: 8 }}>
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
        </Card>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
        <KpiCard
          label="Recovery score"
          value={latest?.recovery_score ?? '—'}
          color={recoveryColor(latest?.recovery_score ?? null)}
          delta={latest?.date ? `Updated ${formatDate(latest.date)}` : 'Waiting for upload'}
          deltaDir="neutral"
        />
        <KpiCard
          label="Sleep performance"
          value={latest?.sleep_perf != null ? `${latest.sleep_perf}%` : '—'}
          color={sleepColor(latest?.sleep_perf ?? null)}
          delta={latest?.sleep_debt != null ? `${latest.sleep_debt} hrs sleep debt` : 'No sleep debt data'}
          deltaDir={(latest?.sleep_debt ?? 0) > 1 ? 'down' : 'neutral'}
        />
        <KpiCard
          label="HRV"
          value={latest?.hrv_ms != null ? `${latest.hrv_ms} ms` : '—'}
          color="#69BE28"
          delta={latest?.resting_hr != null ? `Resting HR ${latest.resting_hr} bpm` : 'No HR data'}
          deltaDir="neutral"
        />
        <KpiCard
          label="Day strain"
          value={latest?.day_strain ?? '—'}
          color={(latest?.day_strain ?? 0) > 14 ? '#ff6b6b' : (latest?.day_strain ?? 0) > 10 ? '#FFA500' : '#69BE28'}
          delta={workout?.activity ? `Latest workout: ${workout.activity}` : 'No workout logged'}
          deltaDir="neutral"
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 14, marginBottom: 14 }}>
        <Card title="Recovery and sleep trend">
          {trendData.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                <CartesianGrid stroke="rgba(10,53,96,0.6)" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: '#A5ACAF', fontSize: 10, fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#A5ACAF', fontSize: 10, fontFamily: 'Inter' }} axisLine={false} tickLine={false} width={28} domain={[0, 100]} />
                <Tooltip contentStyle={{ background: '#001a33', border: '1px solid #0a3560', borderRadius: 6, fontSize: 11 }} labelStyle={{ color: '#fff' }} />
                <Line type="monotone" dataKey="recovery" stroke="#69BE28" strokeWidth={2} dot={{ r: 3, fill: '#69BE28' }} name="Recovery" />
                <Line type="monotone" dataKey="sleep" stroke="#378ADD" strokeWidth={2} dot={{ r: 3, fill: '#378ADD' }} strokeDasharray="4 3" name="Sleep %" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ fontSize: 12, color: '#A5ACAF', lineHeight: 1.6 }}>
              You need at least two wellness records before a recovery trend appears.
            </div>
          )}
        </Card>

        <Card title="Latest detail">
          <MetricRow label="Resting heart rate" value={latest?.resting_hr != null ? `${latest.resting_hr} bpm` : '—'} />
          <MetricRow label="Deep sleep" value={latest?.deep_sleep != null ? `${latest.deep_sleep} hrs` : '—'} />
          <MetricRow label="REM sleep" value={latest?.rem_sleep != null ? `${latest.rem_sleep} hrs` : '—'} />
          <MetricRow label="Respiratory rate" value={latest?.resp_rate != null ? `${latest.resp_rate} rpm` : '—'} />
          <MetricRow label="Blood oxygen" value={latest?.blood_oxygen != null ? `${latest.blood_oxygen}%` : '—'} />
          <MetricRow label="Calories" value={latest?.calories != null ? `${latest.calories}` : '—'} />
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <Card title="Latest habits">
          {habits ? (
            <>
              <div style={{ marginBottom: 8 }}>
                <HabitBadge label="Hydrated" value={habits.hydrated} />
                <HabitBadge label="Protein" value={habits.protein} />
                <HabitBadge label="Caffeine" value={habits.caffeine} />
                <HabitBadge label="Ate late" value={habits.ate_late} />
                <HabitBadge label="Alcohol" value={habits.alcohol} />
                <HabitBadge label="Magnesium" value={habits.magnesium} />
                <HabitBadge label="Creatine" value={habits.creatine} />
                <HabitBadge label="Dimmed lights" value={habits.dimmed_lights} />
                <HabitBadge label="Read before bed" value={habits.read_before_bed} />
              </div>
              {habits.notes ? (
                <div style={{ marginTop: 12, padding: '10px 12px', background: '#001a33', border: '1px solid #0a3560', borderRadius: 8, fontSize: 12, color: '#A5ACAF', lineHeight: 1.6 }}>
                  {habits.notes}
                </div>
              ) : null}
            </>
          ) : (
            <div style={{ fontSize: 12, color: '#A5ACAF' }}>No habit data has been uploaded yet.</div>
          )}
        </Card>

        <Card title="Latest workout">
          {workout ? (
            <>
              <MetricRow label="Activity" value={workout.activity || '—'} />
              <MetricRow label="Date" value={formatDate(workout.date)} />
              <MetricRow label="Duration" value={workout.duration_min != null ? `${workout.duration_min} min` : '—'} />
              <MetricRow label="Strain" value={workout.strain != null ? String(workout.strain) : '—'} />
              <MetricRow label="Calories" value={workout.calories != null ? String(workout.calories) : '—'} />
              <MetricRow label="Heart rate" value={workout.avg_hr != null ? `${workout.avg_hr} avg / ${workout.max_hr ?? '—'} max bpm` : '—'} />
            </>
          ) : (
            <div style={{ fontSize: 12, color: '#A5ACAF' }}>No workout data has been uploaded yet.</div>
          )}
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <Card title="Pulse check-ins" badge={<Badge variant="wolf">{pulse.length} recent</Badge>}>
          {latestPulse ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: pulseTrendData.length > 1 ? 16 : 0 }}>
                {[
                  { label: 'Wellbeing', value: latestPulse.wellbeing_score },
                  { label: 'Burnout', value: latestPulse.burnout_score },
                  { label: 'Energy', value: latestPulse.energy_score },
                  { label: 'Work-life', value: latestPulse.work_life_balance },
                ].map((item) => {
                  const numericValue = item.value ?? null
                  const color = numericValue == null ? '#A5ACAF' : numericValue >= 7 ? '#69BE28' : numericValue >= 5 ? '#FFA500' : '#ff6b6b'

                  return (
                    <div key={item.label} style={{ background: '#001a33', border: '1px solid #0a3560', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, color: '#A5ACAF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 700, color }}>
                        {numericValue ?? '—'}
                        <span style={{ fontSize: 10, color: '#A5ACAF', marginLeft: 2 }}>/10</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {pulseTrendData.length > 1 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={pulseTrendData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                    <CartesianGrid stroke="rgba(10,53,96,0.6)" strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fill: '#A5ACAF', fontSize: 10, fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#A5ACAF', fontSize: 10, fontFamily: 'Inter' }} axisLine={false} tickLine={false} width={28} domain={[0, 10]} />
                    <Tooltip contentStyle={{ background: '#001a33', border: '1px solid #0a3560', borderRadius: 6, fontSize: 11 }} labelStyle={{ color: '#fff' }} />
                    <Line type="monotone" dataKey="wellbeing" stroke="#69BE28" strokeWidth={2} dot={{ r: 3, fill: '#69BE28' }} name="Wellbeing" />
                    <Line type="monotone" dataKey="energy" stroke="#378ADD" strokeWidth={2} dot={{ r: 3, fill: '#378ADD' }} strokeDasharray="4 3" name="Energy" />
                    <Line type="monotone" dataKey="burnout" stroke="#ff6b6b" strokeWidth={2} dot={{ r: 3, fill: '#ff6b6b' }} name="Burnout" />
                  </LineChart>
                </ResponsiveContainer>
              ) : null}
            </>
          ) : (
            <div style={{ fontSize: 12, color: '#A5ACAF', lineHeight: 1.6 }}>
              No pulse survey responses are available yet.
            </div>
          )}
        </Card>

        <Card title="Import history" badge={<Badge variant="wolf">{importBatches.length} recent</Badge>}>
          {importBatches.length > 0 ? (
            <>
              {importBatches.map((batch) => (
                <div key={batch.id} style={{ padding: '10px 0', borderBottom: '1px solid #0a3560' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {batch.file_name}
                    </div>
                    <Badge variant={statusVariant(batch.status)}>{statusLabel(batch.status)}</Badge>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11, color: '#A5ACAF' }}>
                    <span>{formatDate(batch.completed_at ?? batch.started_at)}</span>
                    <span>
                      {batch.rows_inserted} inserted · {batch.rows_updated} updated · {batch.rows_failed} failed
                    </span>
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 12, fontSize: 11, color: '#A5ACAF', lineHeight: 1.6 }}>
                Re-uploading the same workbook is safe. VOILoop upserts existing records instead of duplicating them.
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: '#A5ACAF', lineHeight: 1.6 }}>
              You have not uploaded a WHOOP workbook yet.
            </div>
          )}
        </Card>
      </div>

      <Card title="Upload WHOOP data">
        <div style={{ fontSize: 12, color: '#A5ACAF', marginBottom: 16, lineHeight: 1.6 }}>
          Upload your latest WHOOP export to refresh the recovery, sleep, strain, workout, and habit sections above.
        </div>
        <WhoopImportClient />
      </Card>
    </div>
  )
}
