import { createAdminSupabaseClient } from './admin'

type AdminSupabaseClient = ReturnType<typeof createAdminSupabaseClient>

interface GetUserByIdResult {
  data: { user?: { email?: string | null } | null } | null
  error: { message: string } | null
}

// Resolves auth.users emails for a set of auth_user_ids via the service-role
// admin client. Extracted so callers that need to map participants to their
// auth email (the Admin page's participant labels, getTeamDashboard's pilot/test
// account exclusion) share one lookup implementation instead of duplicating it.
//
// Individual "user not found" errors are swallowed (a stale/deleted auth user
// just gets no email in the resulting map); any other error is rethrown so
// callers can decide how to handle it (most should fail open).
export async function getAuthEmailsByUserId(
  adminClient: AdminSupabaseClient,
  authUserIds: string[],
): Promise<Map<string, string>> {
  const idSet = new Set(authUserIds.filter(Boolean))
  const emailByUserId = new Map<string, string>()
  if (!idSet.size) return emailByUserId

  for (const authUserId of Array.from(idSet)) {
    const { data, error } = await adminClient.auth.admin.getUserById(authUserId) as GetUserByIdResult
    if (error) {
      const lowerMessage = error.message.toLowerCase()
      if (lowerMessage.includes('not found') || lowerMessage.includes('does not exist')) {
        continue
      }
      throw new Error(error.message)
    }
    if (data?.user?.email) {
      emailByUserId.set(authUserId, data.user.email)
    }
  }

  return emailByUserId
}
