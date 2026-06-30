import type { NextRequest } from 'next/server'
import { POST } from '../route'
import { createServerSupabaseClient, getSession } from '@/lib/supabase/server'
import { parseWorkbook } from '@/lib/whoop/parser'
import { validateTabStructure } from '@/lib/whoop/validators'
import { mapExercise, mapManualEntries, mapWellness } from '@/lib/whoop/mappers'

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

jest.mock('@/lib/whoop/mappers', () => ({
  mapExercise: jest.fn(),
  mapWellness: jest.fn(),
  mapManualEntries: jest.fn(),
}))

function makeRequest(fileName = 'whoop-export.xlsx'): NextRequest {
  const formData = new FormData()
  const file = new File([Buffer.from('workbook')], fileName, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  formData.append('file', file)
  return {
    headers: {
      get: (key: string) => (key.toLowerCase() === 'content-type' ? 'multipart/form-data; boundary=test' : null),
    },
    formData: async () => formData,
  } as unknown as NextRequest
}

describe('WHOOP import e2e flow (route-level)', () => {
  const mockGetSession = getSession as jest.MockedFunction<typeof getSession>
  const mockCreateServerSupabaseClient = createServerSupabaseClient as jest.MockedFunction<typeof createServerSupabaseClient>
  const mockParseWorkbook = parseWorkbook as jest.MockedFunction<typeof parseWorkbook>
  const mockValidateTabStructure = validateTabStructure as jest.MockedFunction<typeof validateTabStructure>
  const mockMapExercise = mapExercise as jest.MockedFunction<typeof mapExercise>
  const mockMapWellness = mapWellness as jest.MockedFunction<typeof mapWellness>
  const mockMapManualEntries = mapManualEntries as jest.MockedFunction<typeof mapManualEntries>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('imports valid workbook and returns processed summary', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } } as never)
    mockParseWorkbook.mockReturnValue({ Exercise: [{}], Stress: [{}], Sleep: [{}], 'Manual Entries': [{}] } as never)
    mockValidateTabStructure.mockReturnValue({
      valid: true,
      missingRequiredTabs: [],
      missingAtLeastOneTab: false,
      missingColumns: {},
    })

    mockMapExercise.mockReturnValue({
      processed: 2,
      errors: [],
      workouts: [
        {
          employee_id: 'E1',
          date: '2024-01-15',
          start_time: '2024-01-15T08:00:00.000Z',
          end_time: '2024-01-15T09:00:00.000Z',
          activity: 'Run',
          duration_min: 60,
          strain: 10,
          calories: 450,
          max_hr: 170,
          avg_hr: 145,
          zone1_pct: 10,
          zone2_pct: 20,
          zone3_pct: 30,
          zone4_pct: 30,
          zone5_pct: 10,
        },
        {
          employee_id: 'E1',
          date: '2024-01-15',
          start_time: '2024-01-15T17:00:00.000Z',
          end_time: '2024-01-15T17:45:00.000Z',
          activity: 'Bike',
          duration_min: 45,
          strain: 8,
          calories: 300,
          max_hr: 160,
          avg_hr: 135,
          zone1_pct: 15,
          zone2_pct: 25,
          zone3_pct: 30,
          zone4_pct: 20,
          zone5_pct: 10,
        },
      ],
    })

    mockMapWellness.mockReturnValue({
      processed: 1,
      errors: [],
      wellness: [
        {
          employee_id: 'E1',
          date: '2024-01-15',
          recovery_score: 70,
          hrv_ms: 80,
          resting_hr: 55,
          blood_oxygen: 98,
          skin_temp: 36.6,
          day_strain: 12,
          calories: 2400,
          sleep_perf: 88,
          sleep_hrs: 7.5,
          sleep_debt: 0.2,
          sleep_need: 8.0,
          deep_sleep: 1.2,
          rem_sleep: 1.5,
          light_sleep: 4.8,
          sleep_eff: 92,
          sleep_consistency: 85,
          resp_rate: 14.3,
        },
      ],
    })

    mockMapManualEntries.mockReturnValue({
      processed: 1,
      errors: [],
      habits: [
        {
          employee_id: 'E1',
          date: '2024-01-15',
          alcohol: false,
          caffeine: true,
          ate_late: null,
          hydrated: true,
          protein: true,
          magnesium: null,
          theanine: null,
          creatine: null,
          ashwagandha: null,
          glp1: null,
          tracked_calories: true,
          dimmed_lights: null,
          read_before_bed: null,
          sauna: null,
          hot_tub: null,
          massage: null,
          notes: null,
        },
      ],
    })

    const roleSingle = jest.fn(async () => ({ data: { role: 'admin' }, error: null }))
    const workoutsLte = jest.fn(async () => ({
      data: [{ employee_id: 'E1', start_time: '2024-01-15T08:00:00.000Z' }],
      error: null,
    }))
    const workoutsGte = jest.fn(() => ({ lte: workoutsLte }))
    const workoutsIn = jest.fn(() => ({ gte: workoutsGte }))
    const workoutsSelect = jest.fn(() => ({ in: workoutsIn }))
    const workoutsUpsert = jest.fn(async () => ({ error: null }))
    const wellnessUpsert = jest.fn(async () => ({ error: null }))
    const habitsUpsert = jest.fn(async () => ({ error: null }))
    const auditInsert = jest.fn(async () => ({ error: null }))

    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'user_roles') {
          return {
            select: jest.fn(() => ({ single: roleSingle })),
          }
        }
        if (table === 'workouts') {
          return {
            select: workoutsSelect,
            upsert: workoutsUpsert,
          }
        }
        if (table === 'daily_wellness') {
          return { upsert: wellnessUpsert }
        }
        if (table === 'habits') {
          return { upsert: habitsUpsert }
        }
        if (table === 'import_logs') {
          return { insert: auditInsert }
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    }
    mockCreateServerSupabaseClient.mockReturnValue(supabase as never)

    const response = await POST(makeRequest())
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.fileName).toBe('whoop-export.xlsx')
    expect(body.totals).toEqual({
      processed: 4,
      inserted: 3,
      updated: 1,
      skipped: 0,
      failed: 0,
    })

    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({
      imported_by: 'user-1',
      file_name: 'whoop-export.xlsx',
      rows_processed: 4,
      rows_inserted: 3,
      rows_updated: 1,
      rows_failed: 0,
    }))
  })
})
