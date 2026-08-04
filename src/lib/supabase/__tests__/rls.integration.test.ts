import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const shouldRunRlsIntegration =
  process.env.RUN_SUPABASE_RLS_TESTS === 'true' &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)

const describeRlsIntegration = shouldRunRlsIntegration ? describe : describe.skip

interface TestIdentity {
  userId: string
  email: string
  password: string
  role: 'admin' | 'wellness_director' | 'participant'
  participantId?: string
}

describeRlsIntegration('Supabase RLS integration', () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  const testId = `rls-${Date.now()}`
  const participantAId = `${testId}-a`
  const participantBId = `${testId}-b`
  const basePassword = `Pass!${Date.now()}`

  let serviceClient: SupabaseClient
  let baseEventId = ''
  let uploadBatchIds: string[] = []
  let identities: TestIdentity[] = []

  async function createIdentity(role: TestIdentity['role'], participantId?: string): Promise<TestIdentity> {
    const email = `${testId}-${role}-${Math.random().toString(36).slice(2, 9)}@example.com`
    const { data, error } = await serviceClient.auth.admin.createUser({
      email,
      password: basePassword,
      email_confirm: true,
    })
    if (error || !data.user) {
      throw error ?? new Error(`Failed to create ${role} test user.`)
    }

    const identity: TestIdentity = {
      userId: data.user.id,
      email,
      password: basePassword,
      role,
      participantId,
    }
    identities.push(identity)
    return identity
  }

  async function signIn(identity: TestIdentity): Promise<SupabaseClient> {
    const client = createClient(supabaseUrl, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
    const { error } = await client.auth.signInWithPassword({
      email: identity.email,
      password: identity.password,
    })
    if (error) throw error
    return client
  }

  beforeAll(async () => {
    serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const participantA = await createIdentity('participant', participantAId)
    const participantB = await createIdentity('participant', participantBId)
    const wellnessDirector = await createIdentity('wellness_director')
    const admin = await createIdentity('admin')

    const { error: accessError } = await serviceClient
      .from('user_access')
      .upsert([
        { user_id: participantA.userId, role: 'participant', must_change_password: false },
        { user_id: participantB.userId, role: 'participant', must_change_password: false },
        { user_id: wellnessDirector.userId, role: 'wellness_director', must_change_password: false },
        { user_id: admin.userId, role: 'admin', must_change_password: false },
      ], { onConflict: 'user_id' })
    if (accessError) throw accessError

    const { error: participantsError } = await serviceClient
      .from('participants')
      .upsert([
        {
          id: participantAId,
          auth_user_id: participantA.userId,
          first_name: 'Role',
          last_name: 'ParticipantA',
          department: 'Test',
          title: 'Tester',
          consent: true,
          status: 'Active',
        },
        {
          id: participantBId,
          auth_user_id: participantB.userId,
          first_name: 'Role',
          last_name: 'ParticipantB',
          department: 'Test',
          title: 'Tester',
          consent: true,
          status: 'Active',
        },
      ], { onConflict: 'id' })
    if (participantsError) throw participantsError

    const { error: wellnessError } = await serviceClient
      .from('daily_wellness')
      .upsert([
        { participant_id: participantAId, date: '2026-07-20', recovery_score: 55 },
        { participant_id: participantBId, date: '2026-07-20', recovery_score: 88 },
      ], { onConflict: 'participant_id,date' })
    if (wellnessError) throw wellnessError

    const { data: uploadBatchData, error: uploadBatchError } = await serviceClient
      .from('upload_batches')
      .insert([
        {
          imported_by: admin.userId,
          participant_id: participantAId,
          file_name: `participant-a-${testId}.csv`,
          file_size_bytes: 10,
          file_hash_sha256: `${testId}-hash-a`,
          status: 'completed',
          rows_processed: 1,
          rows_inserted: 1,
          rows_updated: 0,
          rows_skipped: 0,
          rows_failed: 0,
        },
        {
          imported_by: participantA.userId,
          participant_id: participantBId,
          file_name: `uploaded-by-a-${testId}.csv`,
          file_size_bytes: 20,
          file_hash_sha256: `${testId}-hash-b`,
          status: 'completed',
          rows_processed: 1,
          rows_inserted: 1,
          rows_updated: 0,
          rows_skipped: 0,
          rows_failed: 0,
        },
        {
          imported_by: admin.userId,
          participant_id: participantBId,
          file_name: `participant-b-${testId}.csv`,
          file_size_bytes: 30,
          file_hash_sha256: `${testId}-hash-c`,
          status: 'completed',
          rows_processed: 1,
          rows_inserted: 1,
          rows_updated: 0,
          rows_skipped: 0,
          rows_failed: 0,
        },
      ])
      .select('id')
    if (uploadBatchError) throw uploadBatchError
    uploadBatchIds = (uploadBatchData ?? []).map((row) => row.id)

    const { data: eventData, error: eventError } = await serviceClient
      .from('events')
      .insert({
        title: `RLS Test Event ${testId}`,
        description: 'RLS behavior validation',
        event_date: '2026-08-01',
        event_time: '08:00',
        location: 'Test Track',
        event_type: 'general',
        recurring: false,
      })
      .select('id')
      .single()
    if (eventError || !eventData) throw eventError ?? new Error('Failed to create test event.')
    baseEventId = eventData.id
  }, 120000)

  afterAll(async () => {
    if (!serviceClient) return

    if (uploadBatchIds.length > 0) {
      await serviceClient.from('upload_batches').delete().in('id', uploadBatchIds)
    }
    await serviceClient.from('event_rsvps').delete().eq('event_id', baseEventId)
    await serviceClient.from('events').delete().eq('id', baseEventId)
    await serviceClient.from('daily_wellness').delete().in('participant_id', [participantAId, participantBId])
    await serviceClient.from('participants').delete().in('id', [participantAId, participantBId])
    await serviceClient.from('user_access').delete().in('user_id', identities.map((identity) => identity.userId))

    await Promise.all(identities.map(async (identity) => {
      await serviceClient.auth.admin.deleteUser(identity.userId)
    }))
  }, 120000)

  test('participant can only read own daily wellness records', async () => {
    const participantA = identities.find((identity) => identity.role === 'participant' && identity.participantId === participantAId)
    if (!participantA) throw new Error('participantA identity not found')

    const client = await signIn(participantA)
    const { data, error } = await client
      .from('daily_wellness')
      .select('participant_id,recovery_score')
      .in('participant_id', [participantAId, participantBId])

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0]?.participant_id).toBe(participantAId)
  })

  test('participant can read participant-owned and uploader-visible batches only', async () => {
    const participantA = identities.find((identity) => identity.role === 'participant' && identity.participantId === participantAId)
    if (!participantA) throw new Error('participantA identity not found')

    const client = await signIn(participantA)
    const { data, error } = await client
      .from('upload_batches')
      .select('participant_id,imported_by,file_name')
      .order('file_name', { ascending: true })

    expect(error).toBeNull()
    expect(data).toEqual([
      expect.objectContaining({
        participant_id: participantAId,
        file_name: `participant-a-${testId}.csv`,
      }),
      expect.objectContaining({
        participant_id: participantBId,
        imported_by: participantA.userId,
        file_name: `uploaded-by-a-${testId}.csv`,
      }),
    ])
  })

  test('participant cannot RSVP on behalf of another participant', async () => {
    const participantA = identities.find((identity) => identity.role === 'participant' && identity.participantId === participantAId)
    if (!participantA) throw new Error('participantA identity not found')

    const client = await signIn(participantA)
    const { error: crossInsertError } = await client
      .from('event_rsvps')
      .insert({ event_id: baseEventId, participant_id: participantBId })
    expect(crossInsertError).not.toBeNull()

    const { error: ownInsertError } = await client
      .from('event_rsvps')
      .insert({ event_id: baseEventId, participant_id: participantAId })
    expect(ownInsertError).toBeNull()
  })

  test('wellness director can read both participants', async () => {
    const wellnessDirector = identities.find((identity) => identity.role === 'wellness_director')
    if (!wellnessDirector) throw new Error('wellness director identity not found')

    const client = await signIn(wellnessDirector)
    const { data, error } = await client
      .from('daily_wellness')
      .select('participant_id,recovery_score')
      .in('participant_id', [participantAId, participantBId])
      .order('participant_id', { ascending: true })

    expect(error).toBeNull()
    expect(data?.map((row) => row.participant_id)).toEqual([participantAId, participantBId])
  })

  test('admin can read all participant-linked upload batches', async () => {
    const admin = identities.find((identity) => identity.role === 'admin')
    if (!admin) throw new Error('admin identity not found')

    const client = await signIn(admin)
    const { data, error } = await client
      .from('upload_batches')
      .select('file_name')
      .order('file_name', { ascending: true })

    expect(error).toBeNull()
    expect(data?.map((row) => row.file_name)).toEqual([
      `participant-a-${testId}.csv`,
      `participant-b-${testId}.csv`,
      `uploaded-by-a-${testId}.csv`,
    ])
  })

  test('wellness director cannot mutate events, admin can', async () => {
    const wellnessDirector = identities.find((identity) => identity.role === 'wellness_director')
    const admin = identities.find((identity) => identity.role === 'admin')
    if (!wellnessDirector || !admin) throw new Error('leadership identities not found')

    const wdClient = await signIn(wellnessDirector)
    const { error: wdInsertError } = await wdClient
      .from('events')
      .insert({
        title: `Denied event ${testId}`,
        description: '',
        event_date: '2026-08-02',
        event_time: '',
        location: '',
        event_type: 'general',
        recurring: false,
      })
    expect(wdInsertError).not.toBeNull()

    const adminClient = await signIn(admin)
    const { data: createdEvent, error: adminInsertError } = await adminClient
      .from('events')
      .insert({
        title: `Allowed event ${testId}`,
        description: '',
        event_date: '2026-08-03',
        event_time: '',
        location: '',
        event_type: 'general',
        recurring: false,
      })
      .select('id')
      .single()

    expect(adminInsertError).toBeNull()
    expect(createdEvent?.id).toBeTruthy()

    if (createdEvent?.id) {
      await serviceClient.from('events').delete().eq('id', createdEvent.id)
    }
  })
})
