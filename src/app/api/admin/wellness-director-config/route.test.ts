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
          is: jest.fn(async () => ({ data: [], error: null })),
        })),
      })),
    } as never)

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.config.weights).toEqual({
      login_frequency_weight: 25,
      pulse_survey_completion_weight: 20,
      data_submission_weight: 25,
      intervention_follow_up_weight: 15,
      trend_consistency_weight: 15,
    })
  })

  test('GET returns default config when config table is not provisioned', async () => {
    mockRequireAdmin.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          is: jest.fn(async () => ({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'engagement_score_weights'" } })),
        })),
      })),
    } as never)

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.config.weights).toEqual({
      login_frequency_weight: 25,
      pulse_survey_completion_weight: 20,
      data_submission_weight: 25,
      intervention_follow_up_weight: 15,
      trend_consistency_weight: 15,
    })
  })

  test('PUT persists valid weights', async () => {
    mockRequireAdmin.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)
    const upsert = jest.fn(async () => ({ error: null }))
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({
        upsert,
      })),
    } as never)

    const response = await PUT(new Request('http://localhost/api/admin/wellness-director-config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ weights: {
        login_frequency_weight: 30,
        pulse_survey_completion_weight: 20,
        data_submission_weight: 20,
        intervention_follow_up_weight: 15,
        trend_consistency_weight: 15,
      } }),
    }))

    expect(response.status).toBe(200)
    expect(upsert).toHaveBeenCalledWith([
      { organization_id: null, weight_name: 'login_frequency_weight', weight_value: 30, created_by: 'admin-1' },
      { organization_id: null, weight_name: 'pulse_survey_completion_weight', weight_value: 20, created_by: 'admin-1' },
      { organization_id: null, weight_name: 'data_submission_weight', weight_value: 20, created_by: 'admin-1' },
      { organization_id: null, weight_name: 'intervention_follow_up_weight', weight_value: 15, created_by: 'admin-1' },
      { organization_id: null, weight_name: 'trend_consistency_weight', weight_value: 15, created_by: 'admin-1' },
    ], { onConflict: 'organization_id,weight_name' })
  })

  test('PUT returns 503 when config table is not provisioned', async () => {
    mockRequireAdmin.mockResolvedValue({ session: { user: { id: 'admin-1' } }, role: 'admin' } as never)
    mockCreateServerSupabaseClient.mockReturnValue({
      from: jest.fn(() => ({
        upsert: jest.fn(async () => ({ error: { code: 'PGRST205', message: "Could not find the table 'engagement_score_weights'" } })),
      })),
    } as never)

    const response = await PUT(new Request('http://localhost/api/admin/wellness-director-config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ weights: {
        login_frequency_weight: 30,
        pulse_survey_completion_weight: 20,
        data_submission_weight: 20,
        intervention_follow_up_weight: 15,
        trend_consistency_weight: 15,
      } }),
    }))
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toEqual({ error: 'Engagement score weight storage is not provisioned yet.' })
  })
})
