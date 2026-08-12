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
    expect(body.config.weights).toEqual({ recovery: 35, hrv: 15, sleep: 25, debt: 25 })
  })

  test('PUT persists valid weights', async () => {
    mockRequireAdmin.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)
    const upsert = jest.fn(async () => ({ data: { id: 'current', weights: { recovery: 30, hrv: 20, sleep: 25, debt: 25 } }, error: null }))
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({
        upsert,
      })),
    } as never)

    const response = await PUT(new Request('http://localhost/api/admin/wellness-director-config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ weights: { recovery: 30, hrv: 20, sleep: 25, debt: 25 } }),
    }))

    expect(response.status).toBe(200)
    expect(upsert).toHaveBeenCalledWith({
      id: 'current',
      weights: { recovery: 30, hrv: 20, sleep: 25, debt: 25 },
    }, { onConflict: 'id' })
  })
})
