export type DemoWearableHistory = 'complete' | 'sparse' | 'none'
export type DemoTrendDirection = 'improving' | 'declining' | 'steady'

export function demoSeedDate(value = process.env.DEMO_SEED_DATE): string {
  if (value === undefined) return new Date().toISOString().slice(0, 10)
  const date = new Date(`${value}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime())
    || date.toISOString().slice(0, 10) !== value) {
    throw new Error('DEMO_SEED_DATE must be a valid YYYY-MM-DD date.')
  }
  return value
}

export interface AdditionalDemoParticipant {
  id: string
  first_name: string
  last_name: string
  department: string
  title: string
  device_id: string | null
  cohort: string
  daysEnrolledAgo: number
  scenario: {
    baseOffset: number
    trendDirection: DemoTrendDirection
    wearableHistory: DemoWearableHistory
    staleDays?: number
    missingEveryNthDay?: number
  }
}

export const ADDITIONAL_DEMO_PARTICIPANTS: AdditionalDemoParticipant[] = [
  { id: 'EMP011', first_name: 'Avery', last_name: 'Bennett', department: 'Emergency Dept', title: 'ER Nurse', device_id: 'DEMO-011', cohort: 'high-engagement', daysEnrolledAgo: 180, scenario: { baseOffset: 12, trendDirection: 'improving', wearableHistory: 'complete' } },
  { id: 'EMP012', first_name: 'Jordan', last_name: 'Reed', department: 'Pediatrics', title: 'Pediatric Nurse', device_id: 'DEMO-012', cohort: 'steady-participant', daysEnrolledAgo: 165, scenario: { baseOffset: 1, trendDirection: 'steady', wearableHistory: 'complete' } },
  { id: 'EMP013', first_name: 'Morgan', last_name: 'Price', department: 'ICU', title: 'ICU Nurse', device_id: 'DEMO-013', cohort: 'declining-trend', daysEnrolledAgo: 150, scenario: { baseOffset: -7, trendDirection: 'declining', wearableHistory: 'complete' } },
  { id: 'EMP014', first_name: 'Riley', last_name: 'Foster', department: 'Surgery', title: 'Surgical Tech', device_id: 'DEMO-014', cohort: 'red-flag', daysEnrolledAgo: 145, scenario: { baseOffset: -18, trendDirection: 'declining', wearableHistory: 'complete' } },
  { id: 'EMP015', first_name: 'Casey', last_name: 'Brooks', department: 'Admin', title: 'HR Coordinator', device_id: null, cohort: 'no-device-data', daysEnrolledAgo: 130, scenario: { baseOffset: 0, trendDirection: 'steady', wearableHistory: 'none' } },
  { id: 'EMP016', first_name: 'Taylor', last_name: 'Hayes', department: 'Cardiology', title: 'Cardio Nurse', device_id: 'DEMO-016', cohort: 'new-enrollee', daysEnrolledAgo: 7, scenario: { baseOffset: 3, trendDirection: 'improving', wearableHistory: 'complete' } },
  { id: 'EMP017', first_name: 'Quinn', last_name: 'Murphy', department: 'Oncology', title: 'Oncology RN', device_id: 'DEMO-017', cohort: 'pulse-silent', daysEnrolledAgo: 120, scenario: { baseOffset: 5, trendDirection: 'steady', wearableHistory: 'complete' } },
  { id: 'EMP018', first_name: 'Cameron', last_name: 'Ward', department: 'Night Shift', title: 'RN', device_id: 'DEMO-018', cohort: 'stale-device-data', daysEnrolledAgo: 110, scenario: { baseOffset: -2, trendDirection: 'steady', wearableHistory: 'complete', staleDays: 21 } },
  { id: 'EMP019', first_name: 'Drew', last_name: 'Kelly', department: 'Emergency Dept', title: 'ER Tech', device_id: 'DEMO-019', cohort: 'intermittent-device-data', daysEnrolledAgo: 105, scenario: { baseOffset: 0, trendDirection: 'steady', wearableHistory: 'sparse', missingEveryNthDay: 4 } },
  { id: 'EMP020', first_name: 'Skyler', last_name: 'Ross', department: 'Pediatrics', title: 'Pediatric Nurse', device_id: 'DEMO-020', cohort: 'average-engagement', daysEnrolledAgo: 100, scenario: { baseOffset: 0, trendDirection: 'improving', wearableHistory: 'complete' } },
  { id: 'EMP021', first_name: 'Reese', last_name: 'Cooper', department: 'Surgery', title: 'Surgical RN', device_id: 'DEMO-021', cohort: 'low-pulse-completion', daysEnrolledAgo: 95, scenario: { baseOffset: -4, trendDirection: 'declining', wearableHistory: 'sparse', missingEveryNthDay: 5 } },
  { id: 'EMP022', first_name: 'Rowan', last_name: 'Bailey', department: 'ICU', title: 'Respiratory Therapist', device_id: 'DEMO-022', cohort: 'high-strain', daysEnrolledAgo: 90, scenario: { baseOffset: -10, trendDirection: 'declining', wearableHistory: 'complete' } },
  { id: 'EMP023', first_name: 'Emerson', last_name: 'Perry', department: 'Admin', title: 'Program Coordinator', device_id: 'DEMO-023', cohort: 'recent-enrollee', daysEnrolledAgo: 30, scenario: { baseOffset: 2, trendDirection: 'improving', wearableHistory: 'sparse', missingEveryNthDay: 3 } },
  { id: 'EMP024', first_name: 'Finley', last_name: 'Powell', department: 'Cardiology', title: 'Cardio Tech', device_id: 'DEMO-024', cohort: 'no-pulse-history', daysEnrolledAgo: 85, scenario: { baseOffset: 7, trendDirection: 'steady', wearableHistory: 'complete' } },
  { id: 'EMP025', first_name: 'Parker', last_name: 'Long', department: 'Oncology', title: 'Oncology Nurse', device_id: 'DEMO-025', cohort: 'short-history', daysEnrolledAgo: 14, scenario: { baseOffset: -3, trendDirection: 'improving', wearableHistory: 'complete' } },
  { id: 'EMP026', first_name: 'Sage', last_name: 'Patterson', department: 'Night Shift', title: 'Charge Nurse', device_id: 'DEMO-026', cohort: 'low-engagement', daysEnrolledAgo: 80, scenario: { baseOffset: -9, trendDirection: 'declining', wearableHistory: 'sparse', missingEveryNthDay: 3 } },
  { id: 'EMP027', first_name: 'Elliot', last_name: 'Hughes', department: 'Emergency Dept', title: 'Paramedic', device_id: 'DEMO-027', cohort: 'high-engagement', daysEnrolledAgo: 75, scenario: { baseOffset: 9, trendDirection: 'improving', wearableHistory: 'complete' } },
  { id: 'EMP028', first_name: 'Blake', last_name: 'Washington', department: 'Surgery', title: 'Surgical Tech', device_id: 'DEMO-028', cohort: 'data-gap', daysEnrolledAgo: 70, scenario: { baseOffset: -6, trendDirection: 'steady', wearableHistory: 'sparse', missingEveryNthDay: 2 } },
  { id: 'EMP029', first_name: 'Dakota', last_name: 'West', department: 'Pediatrics', title: 'Pediatric Nurse', device_id: 'DEMO-029', cohort: 'average-engagement', daysEnrolledAgo: 60, scenario: { baseOffset: 1, trendDirection: 'steady', wearableHistory: 'complete' } },
  { id: 'EMP030', first_name: 'Robin', last_name: 'Green', department: 'ICU', title: 'ICU Nurse', device_id: 'DEMO-030', cohort: 'no-wearable-history', daysEnrolledAgo: 45, scenario: { baseOffset: -5, trendDirection: 'declining', wearableHistory: 'none' } },
]
