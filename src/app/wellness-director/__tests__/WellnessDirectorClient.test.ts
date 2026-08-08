import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ParticipantWithWellness } from '@/types'
import { WellnessDirectorClient } from '../WellnessDirectorClient'

jest.mock('../WellnessDirectorCharts', () => {
  const React = require('react')
  return {
    WellnessDirectorCharts: ({ type, data }: { type: string; data: unknown }) => React.createElement(
      'pre',
      { 'data-testid': `${type}-chart-data` },
      JSON.stringify(data),
    ),
  }
})

jest.mock('@/components/ui', () => {
  const React = require('react')
  return {
    Card: ({ title, children }: { title: string; children: React.ReactNode }) => React.createElement('section', { 'data-title': title }, children),
    Badge: ({ children }: { children: React.ReactNode }) => React.createElement('span', null, children),
    BarRow: ({ label, value }: { label: string; value: number }) => React.createElement('div', null, `${label}:${value}`),
  }
})

jest.mock('@/lib/utils', () => ({
  recoveryColor: () => '#69BE28',
}))

function makeParticipant(overrides: Partial<ParticipantWithWellness>): ParticipantWithWellness {
  return {
    id: 'P1',
    first_name: 'Alex',
    last_name: 'Able',
    department: 'Ops',
    location_id: null,
    employment_type: null,
    title: 'Nurse',
    device_id: null,
    consent: true,
    enrolled_date: null,
    status: 'Active',
    is_exact_data: false,
    latest_wellness: null,
    latest_workout: null,
    latest_habits: null,
    latest_pulse: null,
    risk_level: 'Low',
    recovery_status: 'green',
    ...overrides,
  }
}

describe('WellnessDirectorClient', () => {
  test('surfaces missing latest-day strain instead of coercing it to zero', () => {
    const markup = renderToStaticMarkup(
      React.createElement(WellnessDirectorClient, {
        participants: [
          makeParticipant({
            id: 'P1',
            first_name: 'Alex',
            last_name: 'Able',
            latest_wellness: { id: 'w1', participant_id: 'P1', source_batch_id: null, date: '2024-06-08', recovery_score: 80, hrv_ms: 70, resting_hr: 58, blood_oxygen: 97, skin_temp: 33.1, day_strain: null, calories: 2200, sleep_perf: 89, sleep_hrs: 7.4, sleep_debt: 0.3, sleep_need: 7.8, deep_sleep: 1.7, rem_sleep: 1.6, light_sleep: 4.1, sleep_eff: 93, sleep_consistency: 86, resp_rate: 14.4 },
          }),
          makeParticipant({
            id: 'P2',
            first_name: 'Blair',
            last_name: 'Baker',
            latest_wellness: { id: 'w2', participant_id: 'P2', source_batch_id: null, date: '2024-06-08', recovery_score: 74, hrv_ms: 63, resting_hr: 60, blood_oxygen: 96, skin_temp: 33.0, day_strain: 11.2, calories: 2100, sleep_perf: 84, sleep_hrs: 7.1, sleep_debt: 0.5, sleep_need: 7.9, deep_sleep: 1.4, rem_sleep: 1.5, light_sleep: 4.2, sleep_eff: 91, sleep_consistency: 82, resp_rate: 14.7 },
          }),
          makeParticipant({
            id: 'P3',
            first_name: 'Casey',
            last_name: 'Cole',
            latest_wellness: { id: 'w3', participant_id: 'P3', source_batch_id: null, date: '2024-06-08', recovery_score: 68, hrv_ms: 59, resting_hr: 61, blood_oxygen: 96, skin_temp: 33.2, day_strain: 0, calories: 2050, sleep_perf: 82, sleep_hrs: 7.0, sleep_debt: 0.6, sleep_need: 7.8, deep_sleep: 1.3, rem_sleep: 1.4, light_sleep: 4.3, sleep_eff: 90, sleep_consistency: 80, resp_rate: 14.8 },
          }),
        ],
      }),
    )

    expect(markup).toContain('Missing latest-day strain: Alex Able')
    expect(markup).toContain('&quot;name&quot;:&quot;Blair&quot;,&quot;value&quot;:11.2')
    expect(markup).toContain('&quot;name&quot;:&quot;Casey&quot;,&quot;value&quot;:0')
    expect(markup).not.toContain('&quot;name&quot;:&quot;Alex&quot;,&quot;value&quot;:0')
  })
})
