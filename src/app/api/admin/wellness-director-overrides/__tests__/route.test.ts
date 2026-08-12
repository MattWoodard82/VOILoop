import { POST } from '../route'
import { requireAdmin } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

jest.mock('@/lib/supabase/server', () => ({
  requireAdmin: jest.fn(),
}))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: jest.fn(),
}))

describe('admin wellness director overrides route', () => {
  const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>
  const mockCreateAdminSupabaseClient = createAdminSupabaseClient as jest.MockedFunction<typeof createAdminSupabaseClient>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('POST updates an existing snooze override flag', async () => {
    mockRequireAdmin.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)
    const maybeSingle = jest.fn(async () => ({ data: { id: 'flag-1' }, error: null }))
    const single = jest.fn(async () => ({ data: { id: 'flag-1', participant_id: 'P1', override_state: 'snoozed' }, error: null }))
    const update = jest.fn(() => ({
      eq: jest.fn(() => ({
        select: jest.fn(() => ({
          single,
        })),
      })),
    }))
    mockCreateAdminSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              eq: jest.fn(() => ({
                order: jest.fn(() => ({
                  limit: jest.fn(() => ({
                    maybeSingle,
                  })),
                })),
              })),
            })),
          })),
        })),
        update,
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
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      participant_id: 'P1',
      flag_type: 'wellness_director',
      override_state: 'snoozed',
      override_reason: 'Follow up next week',
      override_expires_at: '2026-08-14T00:00:00.000Z',
    }))
  })

  test('POST inserts a new dismiss override flag when none exists', async () => {
    mockRequireAdmin.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)
    const maybeSingle = jest.fn(async () => ({ data: null, error: null }))
    const single = jest.fn(async () => ({ data: { id: 'flag-2', participant_id: 'P1', override_state: 'dismissed' }, error: null }))
    const insert = jest.fn(() => ({
      select: jest.fn(() => ({
        single,
      })),
    }))
    mockCreateAdminSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              eq: jest.fn(() => ({
                order: jest.fn(() => ({
                  limit: jest.fn(() => ({
                    maybeSingle,
                  })),
                })),
              })),
            })),
          })),
        })),
        insert,
      })),
    } as never)

    const response = await POST(new Request('http://localhost/api/admin/wellness-director-overrides', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        participant_id: 'P1',
        action: 'dismiss',
        note: 'Not actionable',
      }),
    }))

    expect(response.status).toBe(200)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      participant_id: 'P1',
      flag_type: 'wellness_director',
      override_state: 'dismissed',
      override_reason: 'Not actionable',
      override_expires_at: null,
    }))
  })
})
