import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export type ProvisionableRole = 'admin' | 'participant' | 'wellness_director'

type AdminSupabaseClient = ReturnType<typeof createAdminSupabaseClient>

interface ListUsersResult {
  data: { users?: Array<{ id: string; email?: string | null }> } | null
  error: { message: string } | null
}

interface UpdateUserResult {
  error: { message: string } | null
}

interface CreateUserResult {
  data: { user?: { id: string } | null } | null
  error: { message: string } | null
}

interface UpsertAccessResult {
  error: { message: string } | null
}

interface ProvisionSupabaseAccountInput {
  adminClient: AdminSupabaseClient
  email: string
  password: string
  role: ProvisionableRole
  mustChangePassword: boolean
  existingUserId?: string | null
}

interface ProvisionSupabaseAccountResult {
  userId: string
  status: 'created' | 'updated'
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

async function findUserIdByEmail(adminClient: AdminSupabaseClient, email: string): Promise<string | null> {
  let page = 1

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 }) as ListUsersResult
    if (error) {
      throw new Error(error.message)
    }

    const users = data?.users ?? []
    const existing = users.find((user) => user.email?.toLowerCase() === email)
    if (existing) {
      return existing.id
    }

    if (users.length < 1000) {
      break
    }

    page += 1
  }

  return null
}

export async function provisionSupabaseAccount(
  input: ProvisionSupabaseAccountInput
): Promise<ProvisionSupabaseAccountResult> {
  const normalizedEmail = normalizeEmail(input.email)
  if (!normalizedEmail) {
    throw new Error('Email is required.')
  }

  let userId = input.existingUserId ?? null
  let status: ProvisionSupabaseAccountResult['status'] = 'updated'

  if (!userId) {
    userId = await findUserIdByEmail(input.adminClient, normalizedEmail)
  }

  if (userId) {
    const { error } = await input.adminClient.auth.admin.updateUserById(userId, {
      password: input.password,
      email_confirm: true,
    }) as UpdateUserResult

    if (error) {
      throw new Error(error.message)
    }
  } else {
    const { data, error } = await input.adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password: input.password,
      email_confirm: true,
    }) as CreateUserResult

    if (error || !data?.user?.id) {
      throw new Error(error?.message ?? 'Failed to create user')
    }

    userId = data.user.id
    status = 'created'
  }

  const { error: accessError } = await input.adminClient
    .from('user_access')
    .upsert({
      user_id: userId,
      role: input.role,
      must_change_password: input.mustChangePassword,
    }, { onConflict: 'user_id' }) as UpsertAccessResult

  if (accessError) {
    throw new Error(accessError.message)
  }

  return { userId, status }
}
