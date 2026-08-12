import { POST } from './route'
import { createServerSupabaseClient, requireAdmin } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: jest.fn(),
  requireAdmin: jest.fn(),
}))

describe('admin wellness director overrides route', () => {
  const mockCreateServerSupabaseClient = createServerSupabaseClient as jest.MockedFunction<typeof createServerSupabaseClient>
  const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('POST persists a snooze override', async () => {
    mockRequireAdmin.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)
    const upsert = jest.fn(async () => ({ data: { participant_id: 'P1', action: 'snooze' }, error: null }))
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({
        upsert,
      })),
    } as never)

    const response = await POST(new Request('http://localhost/api/admin/wellness-director-overrides', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        participant_id: 'P1',
        action: 'snooze',
        note: 'Follow up next week',
        snooze_until: '2026-08-14T00:00:00.000Z',
      }),
    }))

    expect(response.status).toBe(200)
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      participant_id: 'P1',
      action: 'snooze',
      note: 'Follow up next week',
      snooze_until: '2026-08-14T00:00:00.000Z',
      updated_by: 'admin-1',
    }), { onConflict: 'participant_id' })
  })
})
