import type { WhoopWorkout, WhoopWellness, WhoopHabit } from '../types'
import { deriveBatchStatus, persistWhoopImport } from '../persistence'
import { mapExercise } from '../mappers'
import { parseWorkbook } from '../parser'
import { toWorkoutInputs, zone2Score } from '../../team-health-score'
import type { Workout } from '@/types'

type TableRow = Record<string, unknown>

class FakeSupabase {
  tables: Record<string, TableRow[]> = {
    upload_batches: [],
    participants: [],
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
  private operation: 'select' | 'insert' | 'update' | 'upsert' | null = null
  private payload: TableRow | TableRow[] | null = null
  private filters: Array<
    | { operator: 'eq'; field: string; value: unknown }
    | { operator: 'in'; field: string; values: unknown[] }
  > = []
  private selectedFields: string[] | null = null
  private upsertConflictFields: string[] = []

  constructor(
    private readonly client: FakeSupabase,
    private readonly table: string,
  ) {}

  select(fields: string) {
    this.selectedFields = fields === '*' ? null : fields.split(',').map((field) => field.trim())
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

  upsert(payload: TableRow | TableRow[], options?: { onConflict?: string }) {
    this.operation = 'upsert'
    this.payload = payload
    this.upsertConflictFields = (options?.onConflict ?? '')
      .split(',')
      .map((field) => field.trim())
      .filter(Boolean)
    return this
  }

  eq(field: string, value: unknown) {
    this.filters.push({ operator: 'eq', field, value })
    return this
  }

  in(field: string, values: unknown[]) {
    this.filters.push({ operator: 'in', field, values })
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
      case 'upsert':
        return this.executeUpsert()
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

  private executeUpsert() {
    const inputRows = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}]
    const upsertedRows = inputRows.map((row) => {
      const existingRow = this.client.tables[this.table].find((candidate) =>
        this.upsertConflictFields.every((field) => this.valuesEqual(field, candidate[field], row[field])),
      )

      if (existingRow) {
        Object.assign(existingRow, row)
        return { ...existingRow }
      }

      const insertedRow = { ...row }
      this.client.tables[this.table].push(insertedRow)
      return insertedRow
    })

    return {
      data: this.selectedFields ? this.applyProjection(upsertedRows) : null,
      error: null,
    }
  }

  private matchingRows() {
    return this.client.tables[this.table].filter((row) =>
      this.filters.every((filter) =>
        filter.operator === 'eq'
          ? this.valuesEqual(filter.field, row[filter.field], filter.value)
          : filter.values.some((value) => this.valuesEqual(filter.field, row[filter.field], value)),
      ),
    )
  }

  private valuesEqual(field: string, a: unknown, b: unknown) {
    if (field === 'start_time' && typeof a === 'string' && typeof b === 'string') {
      return Date.parse(a) === Date.parse(b)
    }
    return a === b
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
  function csvWorkouts(count: number) {
    const header = 'Participant Identifier,Workout start time,Workout end time,Cycle timezone,Activity name,Duration (min),Activity Strain,HR Zone 2 (% in zone)'
    const rows = Array.from({ length: count }, (_, index) => {
      const day = String(2 + Math.floor(index / 2)).padStart(2, '0')
      const hour = index % 2 === 0 ? '08' : '17'
      return `EMP900,2026-07-${day} ${hour}:00:00,2026-07-${day} ${hour}:30:00,UTC-06:00,Run,30,4.7,10`
    })
    const parsed = parseWorkbook(Buffer.from([header, ...rows].join('\n')))
    return mapExercise({ Exercise: parsed[Object.keys(parsed)[0]] })
  }

  async function importExercise(supabase: FakeSupabase, exerciseResult: ReturnType<typeof mapExercise>) {
    return persistWhoopImport({
      supabase: supabase as never, userId: 'user-1', participantId: 'EMP900',
      fileName: 'workouts.csv', fileSize: 1000, fileHash: 'test-hash',
      exerciseResult, wellnessResult: { wellness: [], errors: [], processed: 0 },
      habitsResult: { habits: [], errors: [], processed: 0 }, participantProfiles: [],
    })
  }

  test('real CSV re-import cannot turn 50 legacy workouts into 100 or double Zone 2', async () => {
    const supabase = new FakeSupabase()
    const mapped = csvWorkouts(50)
    const legacyWorkouts: Workout[] = mapped.workouts.map((row, index) => ({
      ...row,
      id: `legacy-${index}`,
      source_batch_id: 'old-batch',
      start_time: new Date(Date.parse(row.start_time) - 6 * 3600_000).toISOString(),
      end_time: new Date(Date.parse(row.end_time!) - 6 * 3600_000).toISOString(),
    }))
    supabase.tables.workouts = legacyWorkouts.map((row) => ({ ...row }))
    const window = { start: '2026-07-02', end: '2026-07-27' }
    const before = zone2Score(toWorkoutInputs(legacyWorkouts), window)
    const result = await importExercise(supabase, mapped)
    expect(result.status).toBe('failed')
    expect(result.totals).toMatchObject({ processed: 50, inserted: 0, updated: 0, failed: 50 })
    expect(result.errors[0]).toMatchObject({ row: 2, field: 'Workout start time' })
    expect(result.errors[0].message).toContain('legacy timezone-shifted')
    expect(supabase.tables.workouts).toHaveLength(50)
    expect(supabase.tables.workouts).toEqual(legacyWorkouts)
    expect(before).toBe(28.8)
  })

  test('blocks a legacy-key collision even when re-exported metrics changed', async () => {
    const supabase = new FakeSupabase()
    const mapped = csvWorkouts(1)
    supabase.tables.workouts = [{
      ...mapped.workouts[0], start_time: '2026-07-02T08:00:00.000Z', strain: 6,
    }]
    const result = await importExercise(supabase, mapped)
    expect(result.totals.failed).toBe(1)
    expect(supabase.tables.workouts).toHaveLength(1)
  })

  test('canonical CSV uploads remain idempotent and do not persist identity metadata', async () => {
    const supabase = new FakeSupabase()
    const mapped = csvWorkouts(50)
    expect((await importExercise(supabase, mapped)).totals.inserted).toBe(50)
    expect((await importExercise(supabase, mapped)).totals.updated).toBe(50)
    expect(supabase.tables.workouts).toHaveLength(50)
    expect(supabase.tables.workouts[0]).not.toHaveProperty('legacyStartTimes')
  })

  test('counts Postgres timestamp spellings as updates, not inserts', async () => {
    const supabase = new FakeSupabase()
    const mapped = csvWorkouts(1)
    supabase.tables.workouts = [{
      ...mapped.workouts[0], start_time: '2026-07-02T14:00:00+00:00',
    }]
    const result = await importExercise(supabase, mapped)
    expect(result.totals).toMatchObject({ inserted: 0, updated: 1, failed: 0 })
    expect(supabase.tables.workouts).toHaveLength(1)
  })

  test('continues safe rows while reporting a legacy collision as a partial import', async () => {
    const supabase = new FakeSupabase()
    const mapped = csvWorkouts(2)
    supabase.tables.workouts = [{
      ...mapped.workouts[0], start_time: '2026-07-02T08:00:00+00:00',
    }]
    const result = await importExercise(supabase, mapped)
    expect(result.status).toBe('partial')
    expect(result.totals).toMatchObject({ processed: 2, inserted: 1, updated: 0, failed: 1 })
    expect(supabase.tables.workouts).toHaveLength(2)
    expect(supabase.tables.import_row_outcomes[0]).toMatchObject({
      outcome: 'failed', row_number: 2, field_name: 'Workout start time',
    })
  })

  test('does not block canonical updates when another workout has the legacy start time', async () => {
    const supabase = new FakeSupabase()
    const mapped = csvWorkouts(1)
    supabase.tables.workouts = [
      { ...mapped.workouts[0], start_time: '2026-07-02T08:00:00.000Z' },
      { ...mapped.workouts[0] },
    ]
    const result = await importExercise(supabase, mapped)
    expect(result.totals).toMatchObject({ inserted: 0, updated: 1, failed: 0 })
    expect(supabase.tables.workouts).toHaveLength(2)
  })

  test('collapses duplicate keys across chunk boundaries and counts skipped rows', async () => {
    const supabase = new FakeSupabase()
    const mapped = csvWorkouts(1)
    mapped.workouts = Array.from({ length: 251 }, () => ({ ...mapped.workouts[0] }))
    mapped.workouts[250].calories = 450
    mapped.processed = 251
    mapped.sourceRows = Array.from({ length: 251 }, (_, index) => index + 2)
    const result = await importExercise(supabase, mapped)
    expect(result.totals).toMatchObject({ processed: 251, inserted: 1, skipped: 250, failed: 0 })
    expect(supabase.tables.workouts).toHaveLength(1)
    expect(supabase.tables.workouts[0].calories).toBe(450)
    expect(supabase.tables.import_row_outcomes).toHaveLength(250)
    expect(supabase.tables.import_row_outcomes.every((row) => row.outcome === 'skipped')).toBe(true)
    expect(supabase.tables.import_row_outcomes.map((row) => row.row_number)).toEqual(
      Array.from({ length: 250 }, (_, index) => index + 2),
    )
  })

  test.each([false, true])('new canonical writes never become legacy collisions across chunks (reverse=%s)', async (reverse) => {
    const supabase = new FakeSupabase()
    const mapped = csvWorkouts(1)
    const template = mapped.workouts[0]
    const workouts = Array.from({ length: 251 }, (_, index) => ({
      ...template,
      start_time: new Date(Date.parse(template.start_time) + index * 60_000).toISOString(),
    }))
    const finalRow = {
      ...template,
      start_time: '2026-07-02T20:00:00.000Z',
      end_time: '2026-07-02T20:30:00.000Z',
    }
    workouts[250] = finalRow
    mapped.workouts = reverse ? workouts.reverse() : workouts
    mapped.processed = 251
    mapped.legacyStartTimes = {
      'EMP900|2026-07-02T20:00:00.000Z': template.start_time,
    }
    const result = await importExercise(supabase, mapped)
    expect(result.totals).toMatchObject({ inserted: 251, updated: 0, failed: 0 })
    expect(supabase.tables.workouts).toHaveLength(251)
  })

  test('preserves an existing day strain when a re-import omits it for the same day', async () => {
    const supabase = new FakeSupabase()

    const participantProfile = {
      participantId: 'EMP901',
      sourceIdentifier: 'EMP901',
      fullName: 'Second Tester',
      firstName: 'Second',
      lastName: 'Tester',
      department: 'Ops',
    }

    await persistWhoopImport({
      supabase: supabase as never,
      userId: 'user-1',
      participantId: 'EMP901',
      fileName: 'whoop-export.xlsx',
      fileSize: 1234,
      fileHash: 'hash-initial',
      exerciseResult: { workouts: [], errors: [], processed: 0 },
      wellnessResult: {
        wellness: [{
          participant_id: 'EMP901',
          date: '2026-07-02',
          sleep_onset_time: null,
          recovery_score: 76,
          hrv_ms: 55,
          resting_hr: 58,
          blood_oxygen: 97,
          skin_temp: 33.1,
          day_strain: 12.1,
          calories: 2200,
          sleep_perf: 89,
          sleep_hrs: 7.4,
          sleep_debt: 0.3,
          sleep_need: 7.8,
          deep_sleep: 1.7,
          rem_sleep: 1.6,
          light_sleep: 4.1,
          sleep_eff: 93,
          sleep_consistency: 86,
          resp_rate: 14.4,
        }],
        errors: [],
        processed: 1,
      },
      habitsResult: { habits: [], errors: [], processed: 0 },
      participantProfiles: [participantProfile],
    })

    await persistWhoopImport({
      supabase: supabase as never,
      userId: 'user-1',
      participantId: 'EMP901',
      fileName: 'whoop-export.xlsx',
      fileSize: 1234,
      fileHash: 'hash-reimport',
      exerciseResult: { workouts: [], errors: [], processed: 0 },
      wellnessResult: {
        wellness: [{
          participant_id: 'EMP901',
          date: '2026-07-02',
          sleep_onset_time: null,
          recovery_score: 79,
          hrv_ms: 57,
          resting_hr: 57,
          blood_oxygen: 97,
          skin_temp: 33.0,
          day_strain: null,
          calories: 2250,
          sleep_perf: 91,
          sleep_hrs: 7.6,
          sleep_debt: 0.2,
          sleep_need: 7.9,
          deep_sleep: 1.8,
          rem_sleep: 1.7,
          light_sleep: 4.1,
          sleep_eff: 94,
          sleep_consistency: 87,
          resp_rate: 14.3,
        }],
        errors: [],
        processed: 1,
      },
      habitsResult: { habits: [], errors: [], processed: 0 },
      participantProfiles: [participantProfile],
    })

    expect(supabase.tables.daily_wellness).toHaveLength(1)
    expect(supabase.tables.daily_wellness[0]).toMatchObject({
      participant_id: 'EMP901',
      date: '2026-07-02',
      recovery_score: 79,
      day_strain: 12.1,
    })
  })

  test('updates existing WHOOP records instead of inserting duplicates on re-import', async () => {
    const supabase = new FakeSupabase()

    const workout: WhoopWorkout = {
      participant_id: 'EMP900',
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
      participant_id: 'EMP900',
      date: '2026-07-01',
      sleep_onset_time: null,
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
      participant_id: 'EMP900',
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

    const participantProfile = {
      participantId: 'EMP900',
      sourceIdentifier: 'EMP900',
      fullName: 'Pilot Tester',
      firstName: 'Pilot',
      lastName: 'Tester',
      department: 'Pilot',
    }

    const firstResult = await persistWhoopImport({
      supabase: supabase as never,
      userId: 'user-1',
      participantId: 'EMP900',
      fileName: 'whoop-export.xlsx',
      fileSize: 1234,
      fileHash: 'hash-1',
      exerciseResult: { workouts: [workout], errors: [], processed: 1 },
      wellnessResult: { wellness: [wellness], errors: [], processed: 1 },
      habitsResult: { habits: [habits], errors: [], processed: 1 },
      participantProfiles: [participantProfile],
    })

    const secondResult = await persistWhoopImport({
      supabase: supabase as never,
      userId: 'user-1',
      participantId: 'EMP900',
      fileName: 'whoop-export.xlsx',
      fileSize: 1234,
      fileHash: 'hash-2',
      exerciseResult: { workouts: [{ ...workout, calories: 450 }], errors: [], processed: 1 },
      wellnessResult: { wellness: [{ ...wellness, recovery_score: 80 }], errors: [], processed: 1 },
      habitsResult: { habits: [{ ...habits, notes: 'Re-imported' }], errors: [], processed: 1 },
      participantProfiles: [participantProfile],
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

    expect(supabase.tables.participants).toHaveLength(1)
    expect(supabase.tables.workouts).toHaveLength(1)
    expect(supabase.tables.daily_wellness).toHaveLength(1)
    expect(supabase.tables.habits).toHaveLength(1)

    expect(supabase.tables.workouts[0]).toMatchObject({
      participant_id: 'EMP900',
      start_time: '2026-07-01T06:00:00.000Z',
      calories: 450,
      source_batch_id: secondResult.batchId,
    })

    expect(supabase.tables.daily_wellness[0]).toMatchObject({
      participant_id: 'EMP900',
      date: '2026-07-01',
      recovery_score: 80,
      source_batch_id: secondResult.batchId,
    })

    expect(supabase.tables.habits[0]).toMatchObject({
      participant_id: 'EMP900',
      date: '2026-07-01',
      notes: 'Re-imported',
      source_batch_id: secondResult.batchId,
    })

    expect(supabase.tables.upload_batches).toHaveLength(2)
    expect(supabase.tables.upload_batches).toEqual([
      expect.objectContaining({
        id: firstResult.batchId,
        imported_by: 'user-1',
        participant_id: 'EMP900',
      }),
      expect.objectContaining({
        id: secondResult.batchId,
        imported_by: 'user-1',
        participant_id: 'EMP900',
      }),
    ])
    expect(supabase.tables.import_logs).toHaveLength(2)
  })
})
