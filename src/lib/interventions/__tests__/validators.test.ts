import { normalizeCreateInterventionInput, validateCreateInterventionInput } from '../validators'

describe('intervention create validators', () => {
  test('normalizes payload and defaults date_triggered', () => {
    const input = normalizeCreateInterventionInput({
      participant_id: ' EMP001 ',
      trigger_metric: ' Recovery Score ',
      trigger_value: ' 38 ',
      intervention_type: ' 1:1 Wellness Check-in ',
      assigned_to: ' Wellness Director ',
      notes: ' Needs immediate review ',
    })

    expect(input).toMatchObject({
      participant_id: 'EMP001',
      trigger_metric: 'Recovery Score',
      trigger_value: '38',
      intervention_type: '1:1 Wellness Check-in',
      assigned_to: 'Wellness Director',
      notes: 'Needs immediate review',
    })
    expect(input.date_triggered).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('rejects invalid required fields and malformed date', () => {
    const input = normalizeCreateInterventionInput({
      participant_id: '',
      trigger_metric: '',
      trigger_value: '',
      intervention_type: '',
      assigned_to: '',
      date_triggered: '07/24/2026',
    })

    const result = validateCreateInterventionInput(input)
    expect(result.ok).toBe(false)
    expect(result.details).toEqual(expect.arrayContaining([
      'participant_id is required',
      'trigger_metric is required',
      'trigger_value is required',
      'intervention_type is required',
      'assigned_to is required',
      'date_triggered must be YYYY-MM-DD',
    ]))
  })

  test('accepts valid normalized payload', () => {
    const input = normalizeCreateInterventionInput({
      participant_id: 'EMP001',
      trigger_metric: 'Day Strain',
      trigger_value: '11.2',
      intervention_type: 'Manager Coaching',
      assigned_to: 'Wellness Director',
      date_triggered: '2026-07-24',
      notes: '',
    })

    const result = validateCreateInterventionInput(input)
    expect(result).toEqual({ ok: true, details: [] })
  })
})
