import { ADDITIONAL_DEMO_PARTICIPANTS, demoSeedDate, type DemoTrendDirection } from './demo-seed-profile'
import type { PulseSurvey } from '@/types'

export const DEMO_STORY_DAYS = 160
export const DEMO_REFRESH_CONFIRMATION = 'REFRESH_DEMO_STORY'

const originalProfiles = [
  ['Devon', 'Harper', 270, -4],
  ['Riley', 'Chen', 270, -9],
  ['Jordan', 'Patel', 250, 2],
  ['Casey', 'Flores', 250, -12],
  ['Morgan', 'Ellis', 240, -38],
  ['Quinn', 'Shah', 220, -6],
  ['Cameron', 'Wells', 220, 4],
  ['Taylor', 'Brooks', 200, -42],
  ['Jamie', 'Alvarez', 180, -14],
  ['Skyler', 'Park', 45, -14],
] as const

export const DEMO_STORY_PARTICIPANTS = [
  ...originalProfiles.map(([first_name, last_name, daysEnrolledAgo, baseOffset], index) => ({
    id: `EMP${String(index + 1).padStart(3, '0')}`,
    first_name, last_name, daysEnrolledAgo,
    scenario: { baseOffset, trendDirection: 'improving' as DemoTrendDirection, wearableHistory: 'complete' as const },
  })),
  ...ADDITIONAL_DEMO_PARTICIPANTS,
]

export function shiftDemoDate(date: string, days: number): string {
  const value = new Date(`${demoSeedDate(date)}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function daysBetween(start: string, end: string): number {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000
}

// Shared workload dip and rebound; anchored to demo day, not backfill length.
function storyPhase(age: number): number {
  const knots = [[0, 1], [30, 0.25], [60, -0.7], [90, -1], [120, -0.25], [160, 0]]
  for (let index = 1; index < knots.length; index += 1) {
    const [younger, value] = knots[index - 1]
    const [older, next] = knots[index]
    if (age <= older) return value + (next - value) * Math.max(0, age - younger) / (older - younger)
  }
  return 0
}

export function demoRecoveryScore(participantId: string, date: string, anchor: string): number {
  const participant = DEMO_STORY_PARTICIPANTS.find(profile => profile.id === participantId)
  if (!participant) throw new Error(`Unknown demo participant: ${participantId}`)
  const age = daysBetween(date, anchor)
  const direction = participant.scenario.trendDirection
  const phase = direction === 'steady' ? 0 : direction === 'declining'
    ? -Math.max(0, Math.min(1, 1 - age / DEMO_STORY_DAYS)) : storyPhase(age)
  const salt = Number(participantId.slice(3))
  const noise = ((Date.parse(`${date}T00:00:00Z`) / 86400000 + salt * 3) % 7) - 3
  return Math.max(1, Math.min(100, Math.round(64 + participant.scenario.baseOffset + phase * 16 + noise)))
}

export type DemoPulseRow = Omit<PulseSurvey, 'id'>
export interface DemoRecoveryRow { participant_id: string; date: string; recovery_score: number }

export function generateDemoStory(anchorDate: string, enrollmentDates: Record<string, string | null> = {}) {
  const anchor = demoSeedDate(anchorDate)
  const start = shiftDemoDate(anchor, -DEMO_STORY_DAYS)
  const recovery: DemoRecoveryRow[] = []
  const pulse: DemoPulseRow[] = []
  const day = new Date(`${anchor}T00:00:00Z`).getUTCDay()
  const monday = shiftDemoDate(anchor, day === 0 ? -6 : 1 - day)

  for (const profile of DEMO_STORY_PARTICIPANTS) {
    const relativeEnrollment = shiftDemoDate(anchor, -profile.daysEnrolledAgo)
    const persistedEnrollment = enrollmentDates[profile.id]
    const cadenceOrigin = persistedEnrollment ?? relativeEnrollment
    const enrolled = persistedEnrollment && persistedEnrollment > relativeEnrollment ? persistedEnrollment : relativeEnrollment
    const firstDate = enrolled > start ? enrolled : start
    const scenario = profile.scenario
    const wearableEnd = shiftDemoDate(anchor, -('staleDays' in scenario ? scenario.staleDays ?? 0 : 0))
    for (let date = firstDate; date <= wearableEnd; date = shiftDemoDate(date, 1)) {
      const missing = 'missingEveryNthDay' in scenario ? scenario.missingEveryNthDay : undefined
      if (scenario.wearableHistory === 'none' || (missing && (daysBetween(cadenceOrigin, date) + 1) % missing === 0)) continue
      recovery.push({ participant_id: profile.id, date, recovery_score: demoRecoveryScore(profile.id, date, anchor) })
    }

    if (['EMP017', 'EMP024'].includes(profile.id)) continue
    for (let week = 0; week <= Math.ceil(DEMO_STORY_DAYS / 7); week += 1) {
      const weekStart = shiftDemoDate(monday, -week * 7)
      const date = week === 0 ? anchor : shiftDemoDate(weekStart, day === 0 ? 6 : day - 1)
      if (date < firstDate || date > anchor) continue
      if (profile.id === 'EMP021' && week % 3 !== 1) continue
      if (profile.id === 'EMP026' && week % 2 === 0) continue
      const recoveryScore = demoRecoveryScore(profile.id, date, anchor)
      const participantNumber = Number(profile.id.slice(3))
      const energy = Math.max(1, Math.min(5, Math.round((recoveryScore - 15) / 14)))
      const rest = Math.max(1, Math.min(5, energy - (participantNumber % 4 === 0 ? 1 : 0)))
      const mentalWellbeing = Math.max(1, energy - (participantNumber % 5 === 0 ? 1 : 0))
      const concerned = energy <= 2
      const activities = ['fitness_center', 'outside', 'local_gym', 'home_gym']
      pulse.push({
        participant_id: profile.id, date,
        confident_health: energy >= 3, body_trending_good: energy >= 3 && scenario.trendDirection !== 'declining',
        energy_level: energy, rest_quality: rest, mental_wellbeing: mentalWellbeing,
        stress_level: Math.min(5, 6 - energy + (participantNumber % 6 === 0 ? 1 : 0)),
        physical_activity: concerned ? ['none'] : [activities[participantNumber % activities.length], 'outside'].filter((value, index, all) => all.indexOf(value) === index),
        program_supported: energy >= 4 ? 'yes' : energy === 3 ? 'neutral' : 'no',
        whoop_reviewed: scenario.wearableHistory === 'none' || concerned ? 'no' : energy >= 4 ? 'yes_regularly' : 'yes_once',
        health_flag: concerned ? 'Fatigue and disrupted sleep persist; requesting a supportive check-in.' : null,
      })
    }
  }
  return { anchor, start, recovery, pulse }
}
