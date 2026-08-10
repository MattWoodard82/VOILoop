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

  test('GET returns default config when config table is not provisioned', async () => {
    mockRequireAdmin.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'wellness_director_config'" } })),
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

  test('PUT returns 503 when config table is not provisioned', async () => {
    mockRequireAdmin.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)
    const single = jest.fn(async () => ({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'wellness_director_config'" } }))
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({
        upsert: jest.fn(() => ({
          select: jest.fn(() => ({
            single,
          })),
        })),
      })),
    } as never)

    const response = await PUT(new Request('http://localhost/api/admin/wellness-director-config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ weights: { recovery: 30, hrv: 20, sleep: 25, debt: 25 } }),
    }))
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toEqual({ error: 'Wellness Director config storage is not provisioned yet.' })
  })
})
