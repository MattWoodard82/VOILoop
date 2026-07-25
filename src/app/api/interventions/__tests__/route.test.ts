import { NextResponse } from 'next/server'
import { POST } from '../route'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { requireInterventionOperator } from '@/lib/interventions/access'

jest.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: jest.fn(),
}))

jest.mock('@/lib/interventions/access', () => ({
  requireInterventionOperator: jest.fn(),
}))

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/interventions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/interventions', () => {
  const mockCreateAdminSupabaseClient = createAdminSupabaseClient as jest.MockedFunction<typeof createAdminSupabaseClient>
  const mockRequireInterventionOperator = requireInterventionOperator as jest.MockedFunction<typeof requireInterventionOperator>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  function assertResponse(response: Response | undefined): Response {
    if (!response) throw new Error('Expected route response')
    return response
  }

  test('creates intervention for authorized role with Pending status', async () => {
    mockRequireInterventionOperator.mockResolvedValue({ userId: 'wd-1', role: 'wellness_director' } as never)

    const insert = jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(async () => ({
          data: {
            id: 'int-1',
            participant_id: 'EMP001',
            outcome: 'Pending',
          },
          error: null,
        })),
      })),
    }))

    mockCreateAdminSupabaseClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'participants') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({
                  data: { id: 'EMP001', department: 'ICU', status: 'Active' },
                  error: null,
                })),
              })),
            })),
          }
        }
        if (table === 'interventions') {
          return { insert }
        }
        return {}
      }),
    } as never)

    const response = await POST(makeRequest({
      participant_id: 'EMP001',
      date_triggered: '2026-07-24',
      trigger_metric: 'Recovery Score',
      trigger_value: '38',
      intervention_type: '1:1 Wellness Check-in',
      assigned_to: 'Wellness Director',
      notes: 'Needs immediate review',
    }))

    const resolved = assertResponse(response)
    expect(resolved.status).toBe(201)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      participant_id: 'EMP001',
      outcome: 'Pending',
      department: 'ICU',
    }))
  })

  test('returns 400 for invalid payload', async () => {
    mockRequireInterventionOperator.mockResolvedValue({ userId: 'wd-1', role: 'wellness_director' } as never)

    const response = await POST(makeRequest({
      participant_id: '',
      trigger_metric: '',
    }))

    const resolved = assertResponse(response)
    expect(resolved.status).toBe(400)
    await expect(resolved.json()).resolves.toMatchObject({ code: 'INVALID_INTERVENTION' })
  })

  test('returns authorization error from access gate', async () => {
    mockRequireInterventionOperator.mockResolvedValue({
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    } as never)

    const response = await POST(makeRequest({
      participant_id: 'EMP001',
      trigger_metric: 'Recovery Score',
      trigger_value: '38',
      intervention_type: '1:1 Wellness Check-in',
      assigned_to: 'Wellness Director',
    }))

    const resolved = assertResponse(response)
    expect(resolved.status).toBe(403)
  })

  test('returns 400 when participant is not active or missing', async () => {
    mockRequireInterventionOperator.mockResolvedValue({ userId: 'wd-1', role: 'wellness_director' } as never)

    mockCreateAdminSupabaseClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'participants') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({
                  data: null,
                  error: null,
                })),
              })),
            })),
          }
        }
        if (table === 'interventions') {
          return { insert: jest.fn() }
        }
        return {}
      }),
    } as never)

    const response = await POST(makeRequest({
      participant_id: 'EMP404',
      date_triggered: '2026-07-24',
      trigger_metric: 'Recovery Score',
      trigger_value: '38',
      intervention_type: '1:1 Wellness Check-in',
      assigned_to: 'Wellness Director',
    }))

    const resolved = assertResponse(response)
    expect(resolved.status).toBe(400)
    await expect(resolved.json()).resolves.toMatchObject({ code: 'INVALID_PARTICIPANT' })
  })
})
