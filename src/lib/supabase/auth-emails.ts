import { createAdminSupabaseClient } from './admin'

type AdminSupabaseClient = ReturnType<typeof createAdminSupabaseClient>

interface GetUserByIdResult {
  data: { user?: { email?: string | null } | null } | null
  error: { message: string } | null
}

// Bounds how many concurrent auth.admin.getUserById requests are in flight at once.
// This runs on default dashboard loads (getTeamDashboard's pilot/test account
// exclusion), so unbounded concurrency risks hammering the admin API for large
// cohorts; a small fixed concurrency still turns O(n) sequential round trips into
// O(n / CONCURRENCY) wall-clock time.
const LOOKUP_CONCURRENCY = 10

// Resolves auth.users emails for a set of auth_user_ids via the service-role
// admin client. Extracted so callers that need to map participants to their
// auth email (the Admin page's participant labels, getTeamDashboard's pilot/test
// account exclusion) share one lookup implementation instead of duplicating it.
//
// Individual "user not found" errors are swallowed (a stale/deleted auth user
// just gets no email in the resulting map); any other error is rethrown so
// callers can decide how to handle it (most should fail open).
//
// Looks up ids in bounded-concurrency chunks (rather than one at a time) so
// latency no longer grows linearly with cohort size - previously this awaited
// one getUserById round trip per participant sequentially, meaning hundreds of
// round trips before any data query even started for a large cohort.
export async function getAuthEmailsByUserId(
  adminClient: AdminSupabaseClient,
  authUserIds: string[],
): Promise<Map<string, string>> {
  const ids = Array.from(new Set(authUserIds.filter(Boolean)))
  const emailByUserId = new Map<string, string>()
  if (!ids.length) return emailByUserId

  const lookupOne = async (authUserId: string) => {
    const { data, error } = await adminClient.auth.admin.getUserById(authUserId) as GetUserByIdResult
    if (error) {
      const lowerMessage = error.message.toLowerCase()
      if (lowerMessage.includes('not found') || lowerMessage.includes('does not exist')) {
        return
      }
      throw new Error(error.message)
    }
    if (data?.user?.email) {
      emailByUserId.set(authUserId, data.user.email)
    }
  }

  for (let start = 0; start < ids.length; start += LOOKUP_CONCURRENCY) {
    const chunk = ids.slice(start, start + LOOKUP_CONCURRENCY)
    await Promise.all(chunk.map((authUserId) => lookupOne(authUserId)))
  }

  return emailByUserId
}
