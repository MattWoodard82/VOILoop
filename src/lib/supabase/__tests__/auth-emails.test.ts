import { getAuthEmailsByUserId } from '../auth-emails'

// Minimal fake admin client whose getUserById resolves after a tick and tracks how
// many calls are in flight concurrently, so tests can prove lookups run with bounded
// concurrency rather than one at a time.
function makeFakeAdminClient(overrides: Record<string, { email?: string; errorMessage?: string }> = {}) {
  let inFlight = 0
  let maxInFlight = 0
  const calls: string[] = []

  const getUserById = jest.fn(async (id: string) => {
    calls.push(id)
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    // Yield a tick so overlapping calls are actually in flight at the same time,
    // instead of a purely synchronous mock resolving before the next call starts.
    await new Promise((resolve) => setTimeout(resolve, 5))
    inFlight -= 1

    const override = overrides[id]
    if (override?.errorMessage) {
      return { data: null, error: { message: override.errorMessage } }
    }
    return { data: { user: { email: override?.email ?? `${id}@example.com` } }, error: null }
  })

  const client = { auth: { admin: { getUserById } } }
  return { client, getMaxInFlight: () => maxInFlight, calls }
}

describe('getAuthEmailsByUserId', () => {
  test('returns an empty map without calling the admin client for an empty id list', async () => {
    const { client, calls } = makeFakeAdminClient()
    const result = await getAuthEmailsByUserId(client as never, [])
    expect(result.size).toBe(0)
    expect(calls).toEqual([])
  })

  test('looks up multiple auth user ids with more than one request in flight at a time', async () => {
    const ids = Array.from({ length: 8 }, (_, i) => `user-${i}`)
    const { client, getMaxInFlight } = makeFakeAdminClient()

    const result = await getAuthEmailsByUserId(client as never, ids)

    expect(getMaxInFlight()).toBeGreaterThan(1)
    for (const id of ids) {
      expect(result.get(id)).toBe(`${id}@example.com`)
    }
  })

  test('swallows a "user not found" error for one id but still resolves the others', async () => {
    const { client } = makeFakeAdminClient({ 'user-missing': { errorMessage: 'User not found' } })
    const result = await getAuthEmailsByUserId(client as never, ['user-1', 'user-missing', 'user-2'])

    expect(result.has('user-missing')).toBe(false)
    expect(result.get('user-1')).toBe('user-1@example.com')
    expect(result.get('user-2')).toBe('user-2@example.com')
  })

  test('rethrows a non-"not found" error', async () => {
    const { client } = makeFakeAdminClient({ 'user-1': { errorMessage: 'Service unavailable' } })
    await expect(getAuthEmailsByUserId(client as never, ['user-1'])).rejects.toThrow('Service unavailable')
  })

  test('deduplicates and ignores falsy ids without calling the admin client for them', async () => {
    const { client, calls } = makeFakeAdminClient()
    await getAuthEmailsByUserId(client as never, ['user-1', 'user-1', '', undefined as unknown as string])
    expect(calls).toEqual(['user-1'])
  })
})
