import type { NextRequest } from 'next/server'
import { POST } from '../route'
import { createServerSupabaseClient, getSession } from '@/lib/supabase/server'
import { parseWorkbook } from '@/lib/whoop/parser'
import { validateTabStructure } from '@/lib/whoop/validators'
import { persistWhoopImport } from '@/lib/whoop/persistence'
import { prepareWhoopWorkbookForImport } from '@/lib/whoop/workbook-context'

jest.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: jest.fn(),
  getSession: jest.fn(),
}))

jest.mock('@/lib/whoop/parser', () => ({
  parseWorkbook: jest.fn(),
}))

jest.mock('@/lib/whoop/validators', () => ({
  validateTabStructure: jest.fn(),
}))

jest.mock('@/lib/whoop/persistence', () => ({
  persistWhoopImport: jest.fn(),
}))

jest.mock('@/lib/whoop/workbook-context', () => ({
  prepareWhoopWorkbookForImport: jest.fn(async (_supabase, workbook) => ({
    workbook,
    participantProfiles: [],
  })),
}))

jest.mock('@/lib/whoop/mappers', () => ({
  mapExercise: jest.fn(() => ({ workouts: [], errors: [], processed: 0 })),
  mapWellness: jest.fn(() => ({ wellness: [], errors: [], processed: 0 })),
  mapManualEntries: jest.fn(() => ({ habits: [], errors: [], processed: 0 })),
}))

function makeRequest(
  fileName = 'whoop.xlsx',
  contentType = 'multipart/form-data; boundary=test',
  participantId = 'EMP001',
): NextRequest {
  const formData = new FormData()
  const file = new File([Buffer.from('dummy')], fileName, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  formData.append('file', file)
  formData.append('participantId', participantId)
  return {
    headers: {
      get: (key: string) => (key.toLowerCase() === 'content-type' ? contentType : null),
    },
    formData: async () => formData,
  } as unknown as NextRequest
}

describe('POST /api/import/whoop integration', () => {
  const mockGetSession = getSession as jest.MockedFunction<typeof getSession>
  const mockCreateServerSupabaseClient = createServerSupabaseClient as jest.MockedFunction<typeof createServerSupabaseClient>
  const mockParseWorkbook = parseWorkbook as jest.MockedFunction<typeof parseWorkbook>
  const mockValidateTabStructure = validateTabStructure as jest.MockedFunction<typeof validateTabStructure>
  const mockPersistWhoopImport = persistWhoopImport as jest.MockedFunction<typeof persistWhoopImport>
  const mockPrepareWhoopWorkbookForImport =
    prepareWhoopWorkbookForImport as jest.MockedFunction<typeof prepareWhoopWorkbookForImport>

  beforeEach(() => {
    jest.clearAllMocks()
    mockPersistWhoopImport.mockReset()
    mockPrepareWhoopWorkbookForImport.mockResolvedValue({
      workbook: {},
      participantProfiles: [],
    })
  })

  test('returns 401 for unauthenticated requests', async () => {
    mockGetSession.mockResolvedValue(null)
    const response = await POST(makeRequest())

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ error: 'Unauthorized' })
  })

  test('rejects non-admin users', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } } as never)

    const mockSupabase = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: { role: 'participant' }, error: null })),
          })),
          single: jest.fn(async () => ({ data: { role: 'participant' }, error: null })),
        })),
      })),
    }
    mockCreateServerSupabaseClient.mockReturnValue(mockSupabase as never)

    const response = await POST(makeRequest('whoop.xlsx', 'application/json'))
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Forbidden',
    })
  })

  test('returns 422 when workbook structure is invalid', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } } as never)

    const mockSupabase = {
      from: jest.fn((table: string) => {
        if (table === 'user_access') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({ data: { role: 'admin' }, error: null })),
              })),
            })),
          }
        }
        if (table === 'participants') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => ({
                    data: {
                      id: 'EMP001',
                      first_name: 'Travis',
                      last_name: 'Brandenburgh',
                      department: 'Ops',
                      device_id: null,
                    },
                    error: null,
                  })),
                })),
              })),
            })),
          }
        }
        if (table === 'user_roles') {
          return {
            select: jest.fn(() => ({
              single: jest.fn(async () => ({ data: { role: 'admin' }, error: null })),
            })),
          }
        }
        return {}
      }),
    }
    mockCreateServerSupabaseClient.mockReturnValue(mockSupabase as never)
    mockParseWorkbook.mockReturnValue({} as never)
    mockPrepareWhoopWorkbookForImport.mockResolvedValue({
      workbook: {},
      participantProfiles: [],
    })
    mockValidateTabStructure.mockReturnValue({
      valid: false,
      missingRequiredTabs: ['Exercise'],
      missingAtLeastOneTab: true,
      missingColumns: { Sleep: ['Cycle start time'] },
    })

    const response = await POST(makeRequest())

    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.error).toBe('Invalid workbook structure')
    expect(body.details).toContain('Missing required tabs: Exercise')
    expect(body.details).toContain('At least one of "Stress" or "Sleep" tabs must be present')
    expect(body.details).toContain('Tab "Sleep" missing columns: Cycle start time')
  })

  test('returns 400 for non-multipart requests', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } } as never)

    const mockSupabase = {
      from: jest.fn((table: string) => {
        if (table === 'user_access') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({ data: { role: 'admin' }, error: null })),
              })),
            })),
          }
        }
        if (table === 'participants') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => ({
                    data: {
                      id: 'EMP001',
                      first_name: 'Travis',
                      last_name: 'Brandenburgh',
                      department: 'Ops',
                      device_id: null,
                    },
                    error: null,
                  })),
                })),
              })),
            })),
          }
        }
        return {
          select: jest.fn(() => ({
            single: jest.fn(async () => ({ data: { role: 'admin' }, error: null })),
          })),
        }
      }),
    }
    mockCreateServerSupabaseClient.mockReturnValue(mockSupabase as never)

    const response = await POST(makeRequest('whoop.xlsx', 'application/json'))
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid content type: expected multipart/form-data',
    })
  })

  test('returns 400 for non-xlsx uploads', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } } as never)

    const mockSupabase = {
      from: jest.fn((table: string) => {
        if (table === 'user_access') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({ data: { role: 'admin' }, error: null })),
              })),
            })),
          }
        }
        if (table === 'participants') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => ({
                    data: {
                      id: 'EMP001',
                      first_name: 'Travis',
                      last_name: 'Brandenburgh',
                      department: 'Ops',
                      device_id: null,
                    },
                    error: null,
                  })),
                })),
              })),
            })),
          }
        }
        return {
          select: jest.fn(() => ({
            single: jest.fn(async () => ({ data: { role: 'admin' }, error: null })),
          })),
        }
      }),
    }
    mockCreateServerSupabaseClient.mockReturnValue(mockSupabase as never)

    const response = await POST(makeRequest('whoop.csv'))
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Only .xlsx WHOOP export files are supported',
    })
  })
})
