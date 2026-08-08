import {
  getCurrentWeekWindow,
  getWeekWindowForDate,
  calculateEngagementScore,
  calculatePhysiologicalTrend,
  calculateRiskTier,
  determineColdStartStatus,
  assessRisk,
  calculateRecencyWeightedScore,
} from '../scoring'
import type { DailyWellness } from '@/types'

describe('scoring service', () => {
  describe('week window calculations', () => {
    it('should calculate current week window with Monday as start', () => {
      // Create a date we know is a Friday (2026-08-07)
      const testDate = new Date('2026-08-07T12:00:00Z')
      const window = getWeekWindowForDate(testDate)

      // Week should start on Monday (2026-08-03)
      expect(window.monday_of_week.toISOString().split('T')[0]).toBe('2026-08-03')

      // Week should span 7 days (Monday through Sunday)
      const daysDiff = Math.round((window.end_date.getTime() - window.start_date.getTime()) / (1000 * 60 * 60 * 24))
      expect(daysDiff).toBe(7)
    })

    it('should handle Monday date', () => {
      const mondayDate = new Date('2026-08-03T12:00:00Z') // Monday
      const window = getWeekWindowForDate(mondayDate)

      expect(window.monday_of_week.toISOString().split('T')[0]).toBe('2026-08-03')
      
      // Week should span 7 days (Monday through Sunday)
      const daysDiff = Math.round((window.end_date.getTime() - window.start_date.getTime()) / (1000 * 60 * 60 * 24))
      expect(daysDiff).toBe(7)
    })

    it('should handle Sunday date', () => {
      const sundayDate = new Date('2026-08-09T12:00:00Z') // Sunday (previous week's Sunday)
      const window = getWeekWindowForDate(sundayDate)

      // Week should start on the Monday of that week
      expect(window.monday_of_week.toISOString().split('T')[0]).toBe('2026-08-03')
      
      // Week should span 7 days (Monday through Sunday)
      const daysDiff = Math.round((window.end_date.getTime() - window.start_date.getTime()) / (1000 * 60 * 60 * 24))
      expect(daysDiff).toBe(7)
    })

    it('should get current week window', () => {
      const window = getCurrentWeekWindow()
      expect(window.start_date).toBeDefined()
      expect(window.end_date).toBeDefined()
      expect(window.end_date > window.start_date).toBe(true)
    })
  })

  describe('engagement score calculation', () => {
    it('should calculate full engagement score with default weights', () => {
      const result = calculateEngagementScore(
        5, // full logins
        1, // full pulse survey
        5, // full data submissions
        1, // intervention follow-up done
        100 // perfect consistency
      )

      expect(result.score).toBe(100)
      expect(result.login_frequency_component).toBe(100)
      expect(result.pulse_survey_component).toBe(100)
      expect(result.data_submission_component).toBe(100)
      expect(result.intervention_follow_up_component).toBe(100)
      expect(result.trend_consistency_component).toBe(100)
    })

    it('should calculate zero engagement score with no activity', () => {
      const result = calculateEngagementScore(
        0, // no logins
        0, // no pulse survey
        0, // no data submissions
        0, // no intervention follow-up
        0 // no consistency
      )

      expect(result.score).toBe(0)
      expect(result.login_frequency_component).toBe(0)
      expect(result.pulse_survey_component).toBe(0)
      expect(result.data_submission_component).toBe(0)
      expect(result.intervention_follow_up_component).toBe(0)
    })

    it('should cap individual components at 100', () => {
      const result = calculateEngagementScore(
        10, // more than 5
        2, // more than 1
        10, // more than 5
        1,
        100
      )

      expect(result.login_frequency_component).toBe(100)
      expect(result.pulse_survey_component).toBe(100)
      expect(result.data_submission_component).toBe(100)
    })

    it('should respect custom weights', () => {
      const result = calculateEngagementScore(
        5,
        1,
        5,
        1,
        100,
        {
          login_frequency_weight: 50,
          pulse_survey_completion_weight: 0,
          data_submission_weight: 50,
          intervention_follow_up_weight: 0,
          trend_consistency_weight: 0,
        }
      )

      // With these weights, score should still be high (login + data at 100%)
      expect(result.score).toBe(100)
    })

    it('should calculate partial engagement score', () => {
      const result = calculateEngagementScore(
        2, // 40% login
        0, // 0% pulse
        2, // 40% data
        0, // 0% intervention
        50 // 50% consistency
      )

      // Should be weighted average of components
      expect(result.score).toBeGreaterThan(0)
      expect(result.score).toBeLessThan(100)
    })
  })

  describe('physiological trend calculation', () => {
    it('should detect declining trend with 2 of 3 metrics declining', () => {
      const recent: DailyWellness[] = [
        {
          id: '1',
          participant_id: 'p1',
          date: '2026-08-01',
          recovery_score: 40,
          hrv_ms: 30,
          sleep_perf: 70,
          source_batch_id: null,
          resting_hr: null,
          blood_oxygen: null,
          skin_temp: null,
          day_strain: null,
          calories: null,
          sleep_hrs: null,
          sleep_debt: null,
          sleep_need: null,
          deep_sleep: null,
          rem_sleep: null,
          light_sleep: null,
          sleep_eff: null,
          sleep_consistency: null,
          resp_rate: null,
        },
      ]

      const baseline: DailyWellness[] = [
        {
          id: '2',
          participant_id: 'p1',
          date: '2026-07-01',
          recovery_score: 60,
          hrv_ms: 50,
          sleep_perf: 60,
          source_batch_id: null,
          resting_hr: null,
          blood_oxygen: null,
          skin_temp: null,
          day_strain: null,
          calories: null,
          sleep_hrs: null,
          sleep_debt: null,
          sleep_need: null,
          deep_sleep: null,
          rem_sleep: null,
          light_sleep: null,
          sleep_eff: null,
          sleep_consistency: null,
          resp_rate: null,
        },
      ]

      const result = calculatePhysiologicalTrend(recent, baseline)

      expect(result.is_declining).toBe(true)
      expect(result.decline_metric_count).toBe(2)
      expect(result.metrics_evaluated.length).toBe(3)
    })

    it('should not detect declining trend with only 1 of 3 metrics declining', () => {
      const recent: DailyWellness[] = [
        {
          id: '1',
          participant_id: 'p1',
          date: '2026-08-01',
          recovery_score: 55, // declining
          hrv_ms: 51, // not declining
          sleep_perf: 65, // improving
          source_batch_id: null,
          resting_hr: null,
          blood_oxygen: null,
          skin_temp: null,
          day_strain: null,
          calories: null,
          sleep_hrs: null,
          sleep_debt: null,
          sleep_need: null,
          deep_sleep: null,
          rem_sleep: null,
          light_sleep: null,
          sleep_eff: null,
          sleep_consistency: null,
          resp_rate: null,
        },
      ]

      const baseline: DailyWellness[] = [
        {
          id: '2',
          participant_id: 'p1',
          date: '2026-07-01',
          recovery_score: 60,
          hrv_ms: 50,
          sleep_perf: 60,
          source_batch_id: null,
          resting_hr: null,
          blood_oxygen: null,
          skin_temp: null,
          day_strain: null,
          calories: null,
          sleep_hrs: null,
          sleep_debt: null,
          sleep_need: null,
          deep_sleep: null,
          rem_sleep: null,
          light_sleep: null,
          sleep_eff: null,
          sleep_consistency: null,
          resp_rate: null,
        },
      ]

      const result = calculatePhysiologicalTrend(recent, baseline)

      expect(result.is_declining).toBe(false)
      expect(result.decline_metric_count).toBeLessThan(2)
    })

    it('should handle empty recent wellness data', () => {
      const result = calculatePhysiologicalTrend([], [])

      expect(result.is_declining).toBe(false)
      expect(result.decline_metric_count).toBe(0)
      expect(result.metrics_evaluated).toEqual([])
    })

    it('should handle missing metrics in data', () => {
      const recent: DailyWellness[] = [
        {
          id: '1',
          participant_id: 'p1',
          date: '2026-08-01',
          recovery_score: null,
          hrv_ms: 30,
          sleep_perf: 70,
          source_batch_id: null,
          resting_hr: null,
          blood_oxygen: null,
          skin_temp: null,
          day_strain: null,
          calories: null,
          sleep_hrs: null,
          sleep_debt: null,
          sleep_need: null,
          deep_sleep: null,
          rem_sleep: null,
          light_sleep: null,
          sleep_eff: null,
          sleep_consistency: null,
          resp_rate: null,
        },
      ]

      const baseline: DailyWellness[] = [
        {
          id: '2',
          participant_id: 'p1',
          date: '2026-07-01',
          recovery_score: 60,
          hrv_ms: 50,
          sleep_perf: 60,
          source_batch_id: null,
          resting_hr: null,
          blood_oxygen: null,
          skin_temp: null,
          day_strain: null,
          calories: null,
          sleep_hrs: null,
          sleep_debt: null,
          sleep_need: null,
          deep_sleep: null,
          rem_sleep: null,
          light_sleep: null,
          sleep_eff: null,
          sleep_consistency: null,
          resp_rate: null,
        },
      ]

      const result = calculatePhysiologicalTrend(recent, baseline)

      expect(result.metrics_evaluated.length).toBe(3)
      // First metric should not be marked as declining since it's missing in recent
      expect(result.metrics_evaluated[0].is_declining).toBe(false)
    })
  })

  describe('risk tier calculation', () => {
    it('should return no_data when hasNoData is true', () => {
      const tier = calculateRiskTier(null, null, true)
      expect(tier).toBe('no_data')
    })

    it('should return green for high engagement score', () => {
      const tier = calculateRiskTier(85, null, false)
      expect(tier).toBe('green')
    })

    it('should return yellow for medium engagement score', () => {
      const tier = calculateRiskTier(55, null, false)
      expect(tier).toBe('yellow')
    })

    it('should return red for low engagement score', () => {
      const tier = calculateRiskTier(25, null, false)
      expect(tier).toBe('red')
    })

    it('should return red for declining physiological trend', () => {
      const trend = {
        is_declining: true,
        decline_metric_count: 2,
        metrics_evaluated: [],
      }
      const tier = calculateRiskTier(75, trend, false)
      expect(tier).toBe('red')
    })

    it('should combine engagement and trend risks (worst case wins)', () => {
      const trend = {
        is_declining: true,
        decline_metric_count: 2,
        metrics_evaluated: [],
      }
      // High engagement but declining trend = red risk
      const tier = calculateRiskTier(85, trend, false)
      expect(tier).toBe('red')
    })
  })

  describe('cold-start status determination', () => {
    it('should return cold_start for enrolled < 21 days', () => {
      const enrollDate = new Date()
      enrollDate.setDate(enrollDate.getDate() - 10)

      const result = determineColdStartStatus(
        enrollDate.toISOString(),
        new Date()
      )

      expect(result.status).toBe('cold_start')
      expect(result.daysEnrolled).toBeLessThan(21)
    })

    it('should return active for enrolled >= 21 days', () => {
      const enrollDate = new Date()
      enrollDate.setDate(enrollDate.getDate() - 30)

      const result = determineColdStartStatus(
        enrollDate.toISOString(),
        new Date()
      )

      expect(result.status).toBe('active')
      expect(result.daysEnrolled).toBeGreaterThanOrEqual(21)
    })

    it('should return cold_start for null enrollment date', () => {
      const result = determineColdStartStatus(null)

      expect(result.status).toBe('cold_start')
      expect(result.daysEnrolled).toBe(0)
    })
  })

  describe('full risk assessment', () => {
    it('should assess risk for active participant with good engagement', () => {
      const enrollDate = new Date()
      enrollDate.setDate(enrollDate.getDate() - 30)

      const wellnessData: DailyWellness[] = [
        {
          id: '1',
          participant_id: 'p1',
          date: '2026-08-01',
          recovery_score: 75,
          hrv_ms: 55,
          sleep_perf: 75,
          source_batch_id: null,
          resting_hr: null,
          blood_oxygen: null,
          skin_temp: null,
          day_strain: null,
          calories: null,
          sleep_hrs: null,
          sleep_debt: null,
          sleep_need: null,
          deep_sleep: null,
          rem_sleep: null,
          light_sleep: null,
          sleep_eff: null,
          sleep_consistency: null,
          resp_rate: null,
        },
      ]

      const result = assessRisk(
        enrollDate.toISOString(),
        5, // good login activity
        1, // pulse survey
        5, // data submissions
        1, // intervention follow-up
        wellnessData,
        [], // no baseline for trend assessment
        false // no overrides
      )

      expect(result.risk_tier).not.toBe('no_data')
      expect(result.cold_start_status).toBe('active')
      expect(result.days_enrolled).toBeGreaterThanOrEqual(21)
    })

    it('should assess risk for cold-start participant', () => {
      const enrollDate = new Date()
      enrollDate.setDate(enrollDate.getDate() - 10)

      const result = assessRisk(
        enrollDate.toISOString(),
        0, // no login activity
        0, // no pulse survey
        0, // no data submissions
        0, // no intervention follow-up
        [], // no wellness data
        [],
        false
      )

      expect(result.cold_start_status).toBe('cold_start')
      expect(result.days_enrolled).toBeLessThan(21)
    })

    it('should detect no data scenario', () => {
      const enrollDate = new Date()
      enrollDate.setDate(enrollDate.getDate() - 30)

      const result = assessRisk(
        enrollDate.toISOString(),
        0,
        0,
        0,
        0,
        [],
        [],
        false
      )

      expect(result.risk_tier).toBe('no_data')
    })
  })

  describe('recency-weighted scoring', () => {
    it('should weight recent events higher', () => {
      const referenceDate = new Date('2026-08-08T00:00:00Z')
      const events = [
        { date: new Date('2026-08-07T00:00:00Z'), value: 90 }, // 1 day ago
        { date: new Date('2026-08-01T00:00:00Z'), value: 10 }, // 7 days ago
      ]

      const score = calculateRecencyWeightedScore(events, referenceDate)

      expect(score).toBeGreaterThan(50)
      expect(score).toBeLessThan(90)
    })

    it('should return 0 for empty events', () => {
      const score = calculateRecencyWeightedScore([])
      expect(score).toBe(0)
    })

    it('should handle single event', () => {
      const events = [
        { date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), value: 75 },
      ]

      const score = calculateRecencyWeightedScore(events)
      expect(score).toBeCloseTo(75, 1)
    })
  })
})
