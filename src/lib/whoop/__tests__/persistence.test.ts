import type { WhoopWorkout, WhoopWellness, WhoopHabit } from '../types'
import { deriveBatchStatus, persistWhoopImport } from '../persistence'

type TableRow = Record<string, unknown>

class FakeSupabase {
  tables: Record<string, TableRow[]> = {
    upload_batches: [],
    employees: [],
    workouts: [],
    daily_wellness: [],
    habits: [],
    import_logs: [],
    import_row_outcomes: [],
  }

  private batchCounter = 1

  from(table: string) {
    return new FakeQueryBuilder(this, table)
  }

  nextBatchId() {
    const id = `batch-${this.batchCounter}`
    this.batchCounter += 1
    return id
  }
}

class FakeQueryBuilder implements PromiseLike<{ data: any; error: null }> {
  private operation: 'select' | 'insert' | 'update' | null = null
  private payload: TableRow | TableRow[] | null = null
  private filters: Array<{ field: string; value: unknown }> = []
  private selectedFields: string[] | null = null

  constructor(
    private readonly client: FakeSupabase,
    private readonly table: string,
  ) {}

  select(fields: string) {
    this.selectedFields = fields.split(',').map((field) => field.trim())
    if (!this.operation) {
      this.operation = 'select'
    }
    return this
  }

  insert(payload: TableRow | TableRow[]) {
    this.operation = 'insert'
    this.payload = payload
    return this
  }

  update(payload: TableRow) {
    this.operation = 'update'
    this.payload = payload
    return this
  }

  eq(field: string, value: unknown) {
    this.filters.push({ field, value })
    return this
  }

  async maybeSingle() {
    const result = await this.execute()
    if (!result.data || result.data.length === 0) {
      return { data: null, error: null }
    }
    return { data: result.data[0], error: null }
  }

  async single() {
    const result = await this.execute()
    if (Array.isArray(result.data)) {
      return { data: result.data[0] ?? null, error: null }
    }
    return result
  }

  then<TResult1 = { data: any; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled ?? undefined, onrejected ?? undefined)
  }

  private async execute() {
    switch (this.operation) {
      case 'select':
        return {
          data: this.applyProjection(this.matchingRows().map((row) => ({ ...row }))),
          error: null,
        }
      case 'insert':
        return this.executeInsert()
      case 'update':
        return this.executeUpdate()
      default:
        return { data: null, error: null }
    }
  }

  private executeInsert() {
    const inputRows = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}]
    const insertedRows = inputRows.map((row) => {
      const insertedRow = { ...row }
      if (this.table === 'upload_batches' && !insertedRow.id) {
        insertedRow.id = this.client.nextBatchId()
      }
      this.client.tables[this.table].push(insertedRow)
      return insertedRow
    })

    return {
      data: this.selectedFields ? this.applyProjection(insertedRows) : null,
      error: null,
    }
  }

  private executeUpdate() {
    const rows = this.matchingRows()
    const updatedRows = rows.map((row) => {
      Object.assign(row, this.payload ?? {})
      return { ...row }
    })

    return {
      data: this.selectedFields ? this.applyProjection(updatedRows) : null,
      error: null,
    }
  }

  private matchingRows() {
    return this.client.tables[this.table].filter((row) =>
      this.filters.every((filter) => row[filter.field] === filter.value),
    )
  }

  private applyProjection(rows: TableRow[]) {
    if (!this.selectedFields) return rows
    return rows.map((row) => {
      const projected: TableRow = {}
      this.selectedFields?.forEach((field) => {
        projected[field] = row[field]
      })
      return projected
    })
  }
}

describe('deriveBatchStatus', () => {
  test('returns completed when there are no failures', () => {
    expect(deriveBatchStatus({
      processed: 10,
      inserted: 8,
      updated: 2,
      skipped: 0,
      failed: 0,
    })).toBe('completed')
  })

  test('returns partial when there are mixed successes and failures', () => {
    expect(deriveBatchStatus({
      processed: 10,
      inserted: 4,
      updated: 1,
      skipped: 0,
      failed: 5,
    })).toBe('partial')
  })

  test('returns failed when all rows failed', () => {
    expect(deriveBatchStatus({
      processed: 10,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 10,
    })).toBe('failed')
  })
})

describe('persistWhoopImport', () => {
  test('updates existing WHOOP records instead of inserting duplicates on re-import', async () => {
    const supabase = new FakeSupabase()

    const workout: WhoopWorkout = {
      employee_id: 'EMP900',
      date: '2026-07-01',
      start_time: '2026-07-01T06:00:00.000Z',
      end_time: '2026-07-01T06:45:00.000Z',
      activity: 'Run',
      duration_min: 45,
      strain: 12.4,
      calories: 420,
      max_hr: 171,
      avg_hr: 148,
      zone1_pct: 10,
      zone2_pct: 20,
      zone3_pct: 30,
      zone4_pct: 25,
      zone5_pct: 15,
    }

    const wellness: WhoopWellness = {
      employee_id: 'EMP900',
      date: '2026-07-01',
      recovery_score: 78,
      hrv_ms: 52,
      resting_hr: 56,
      blood_oxygen: 97,
      skin_temp: 33.1,
      day_strain: 12.4,
      calories: 2400,
      sleep_perf: 90,
      sleep_hrs: 7.8,
      sleep_debt: 0.2,
      sleep_need: 8.0,
      deep_sleep: 1.9,
      rem_sleep: 1.8,
      light_sleep: 4.1,
      sleep_eff: 95,
      sleep_consistency: 88,
      resp_rate: 14.8,
    }

    const habits: WhoopHabit = {
      employee_id: 'EMP900',
      date: '2026-07-01',
      alcohol: false,
      caffeine: true,
      ate_late: false,
      hydrated: true,
      protein: true,
      magnesium: true,
      theanine: null,
      creatine: true,
      ashwagandha: false,
      glp1: null,
      tracked_calories: true,
      dimmed_lights: true,
      read_before_bed: false,
      sauna: null,
      hot_tub: null,
      massage: null,
      notes: 'Initial import',
    }

    const employeeProfile = {
      employeeId: 'EMP900',
      sourceIdentifier: 'EMP900',
      fullName: 'Pilot Tester',
      firstName: 'Pilot',
      lastName: 'Tester',
      department: 'Pilot',
    }

    const firstResult = await persistWhoopImport({
      supabase: supabase as never,
      userId: 'user-1',
      fileName: 'whoop-export.xlsx',
      fileSize: 1234,
      fileHash: 'hash-1',
      exerciseResult: { workouts: [workout], errors: [], processed: 1 },
      wellnessResult: { wellness: [wellness], errors: [], processed: 1 },
      habitsResult: { habits: [habits], errors: [], processed: 1 },
      employeeProfiles: [employeeProfile],
    })

    const secondResult = await persistWhoopImport({
      supabase: supabase as never,
      userId: 'user-1',
      fileName: 'whoop-export.xlsx',
      fileSize: 1234,
      fileHash: 'hash-2',
      exerciseResult: { workouts: [{ ...workout, calories: 450 }], errors: [], processed: 1 },
      wellnessResult: { wellness: [{ ...wellness, recovery_score: 80 }], errors: [], processed: 1 },
      habitsResult: { habits: [{ ...habits, notes: 'Re-imported' }], errors: [], processed: 1 },
      employeeProfiles: [employeeProfile],
    })

    expect(firstResult.totals).toEqual({
      processed: 3,
      inserted: 3,
      updated: 0,
      skipped: 0,
      failed: 0,
    })

    expect(secondResult.totals).toEqual({
      processed: 3,
      inserted: 0,
      updated: 3,
      skipped: 0,
      failed: 0,
    })

    expect(supabase.tables.employees).toHaveLength(1)
    expect(supabase.tables.workouts).toHaveLength(1)
    expect(supabase.tables.daily_wellness).toHaveLength(1)
    expect(supabase.tables.habits).toHaveLength(1)

    expect(supabase.tables.workouts[0]).toMatchObject({
      employee_id: 'EMP900',
      start_time: '2026-07-01T06:00:00.000Z',
      calories: 450,
      source_batch_id: secondResult.batchId,
    })

    expect(supabase.tables.daily_wellness[0]).toMatchObject({
      employee_id: 'EMP900',
      date: '2026-07-01',
      recovery_score: 80,
      source_batch_id: secondResult.batchId,
    })

    expect(supabase.tables.habits[0]).toMatchObject({
      employee_id: 'EMP900',
      date: '2026-07-01',
      notes: 'Re-imported',
      source_batch_id: secondResult.batchId,
    })

    expect(supabase.tables.upload_batches).toHaveLength(2)
    expect(supabase.tables.import_logs).toHaveLength(2)
  })
})
