import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WellnessDirectorClient } from '../WellnessDirectorClient'

jest.mock('../WellnessDirectorCharts', () => ({ WellnessDirectorCharts: ({ data }: { data: unknown }) => React.createElement('pre', null, JSON.stringify(data)) }))
jest.mock('@/components/ui', () => {
  const React = require('react')
  return {
    Card: ({ title, children }: { title: string; children: React.ReactNode }) => React.createElement('section', { 'data-title': title }, children),
    Badge: ({ children }: { children: React.ReactNode }) => React.createElement('span', null, children),
    BarRow: ({ label, value }: { label: string; value: number }) => React.createElement('div', null, `${label}:${value}`),
  }
})
jest.mock('@/lib/utils', () => ({ recoveryColor: () => '#69BE28' }))

const participant = {
  id: 'P1',
  first_name: 'Alex',
  last_name: 'Able',
  department: 'Ops',
  location_id: null,
  employment_type: null,
  title: 'Nurse',
  device_id: null,
  consent: true,
  enrolled_date: '2026-08-01',
  status: 'Active',
  is_exact_data: false,
  latest_wellness: { id: 'w1', participant_id: 'P1', source_batch_id: null, date: '2026-08-07', recovery_score: 72, hrv_ms: 66, resting_hr: 58, blood_oxygen: 97, skin_temp: 33.1, day_strain: 11, calories: 2200, sleep_perf: 84, sleep_hrs: 7.4, sleep_debt: 1.1, sleep_need: 7.8, deep_sleep: 1.7, rem_sleep: 1.6, light_sleep: 4.1, sleep_eff: 93, sleep_consistency: 86, resp_rate: 14.4 },
  latest_workout: null,
  latest_habits: null,
  latest_pulse: null,
  risk_level: 'Low',
  recovery_status: 'green',
  engagement_score: 68,
  engagement_score_components: { recovery: 25, hrv: 10, sleep: 21, debt_penalty: 12 },
  physiological_trend: 'improving',
  physiological_trend_metrics: ['HRV', 'resting HR'],
  risk_tier_label: 'Stable',
  risk_trigger_reasons: [],
  baseline_state: 'building',
  baseline_days_remaining: 13,
  override_state: null,
  override_note: null,
}

describe('WellnessDirectorClient', () => {
  test('renders explainability and baseline state', () => {
    const markup = renderToStaticMarkup(React.createElement(WellnessDirectorClient, { participants: [participant] as any }))
    expect(markup).toContain('Engagement score')
    expect(markup).toContain('Baseline building')
    expect(markup).toContain('improving')
  })

  test('supports snooze and dismiss overrides', () => {
    const markup = renderToStaticMarkup(React.createElement(WellnessDirectorClient, { participants: [{ ...participant, id: 'P2' }] as any }))
    expect(markup).toContain('Snooze')
    expect(markup).toContain('Dismiss')
  })

  test('shows baseline state when a participant is selected', () => {
    const markup = renderToStaticMarkup(React.createElement(WellnessDirectorClient, { participants: [participant] as any }))
    expect(markup).toContain('Baseline building')
  })
})
