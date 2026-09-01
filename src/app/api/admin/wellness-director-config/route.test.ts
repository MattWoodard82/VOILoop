import { GET, PUT } from './route'
import { createServerSupabaseClient, requireAdmin } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: jest.fn(),
  requireAdmin: jest.fn(),
}))

describe('admin wellness director config route', () => {
  const mockCreateServerSupabaseClient = createServerSupabaseClient as jest.MockedFunction<typeof createServerSupabaseClient>
  const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('GET returns default config when missing', async () => {
    mockRequireAdmin.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
    } as never)

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.config.weights).toEqual({
      submission_consistency: 25,
      device_wear_consistency: 20,
      pulse_completion: 20,
      nudge_response: 15,
      workout_volume: 20,
    })
  })

  test('GET normalizes a persisted legacy weights row back to FR-13 defaults', async () => {
    mockRequireAdmin.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({
              data: { id: 'current', weights: { recovery: 40, hrv: 20, sleep: 20, debt: 20 } },
              error: null,
            })),
          })),
        })),
      })),
    } as never)

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.config.weights).toEqual({
      submission_consistency: 25,
      device_wear_consistency: 20,
      pulse_completion: 20,
      nudge_response: 15,
      workout_volume: 20,
    })
  })

  test('PUT persists valid weights', async () => {
    mockRequireAdmin.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)
    const weights = {
      submission_consistency: 30,
      device_wear_consistency: 20,
      pulse_completion: 20,
      nudge_response: 10,
      workout_volume: 20,
    }
    const upsert = jest.fn(async () => ({ data: { id: 'current', weights }, error: null }))
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({
        upsert,
      })),
    } as never)

    const response = await PUT(new Request('http://localhost/api/admin/wellness-director-config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ weights }),
    }))

    expect(response.status).toBe(200)
    expect(upsert).toHaveBeenCalledWith({
      id: 'current',
      weights,
    }, { onConflict: 'id' })
  })

  test('PUT rejects a saved-looking row with an out-of-range negative weight even though it sums to 100', async () => {
    mockRequireAdmin.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)
    const upsert = jest.fn()
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({ upsert })),
    } as never)

    const response = await PUT(new Request('http://localhost/api/admin/wellness-director-config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        weights: {
          submission_consistency: -10,
          device_wear_consistency: 40,
          pulse_completion: 30,
          nudge_response: 20,
          workout_volume: 20,
        },
      }),
    }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatch(/0-100/)
    expect(upsert).not.toHaveBeenCalled()
  })
})
