export const PRESERVED_TEST_ACCOUNT_EMAIL = 'test1@user.com'
export const PILOT_ACCOUNT_BAN_DURATION = '876000h'

export type PilotDeactivationMethod = 'ban' | 'password-rotation'

export interface PilotAuthUser {
  id: string
  email?: string | null
}

export interface DeactivationOptions {
  apply: boolean
  verifyBan: boolean
  method: PilotDeactivationMethod | null
  confirmedProjectRef: string | null
  preserveEmails: string[]
}

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase()
}

export function selectPilotAccountsToDeactivate<T extends PilotAuthUser>(
  users: T[],
  extraPreservedEmails: string[] = []
): T[] {
  if (!users.some(user => normalizeEmail(user.email) === PRESERVED_TEST_ACCOUNT_EMAIL)) {
    throw new Error('Protected test1@user.com account is absent; refusing pilot account deactivation.')
  }
  const preservedSet = new Set([
    PRESERVED_TEST_ACCOUNT_EMAIL,
    ...extraPreservedEmails.map(normalizeEmail),
  ])
  return users.filter((user) => !preservedSet.has(normalizeEmail(user.email)))
}

export function parseDeactivationOptions(argv: string[]): DeactivationOptions {
  const options: DeactivationOptions = {
    apply: false,
    verifyBan: false,
    method: null,
    confirmedProjectRef: null,
    preserveEmails: [],
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--apply') {
      options.apply = true
    } else if (argument === '--verify-ban') {
      options.verifyBan = true
    } else if (argument === '--method') {
      const method = argv[index + 1]
      if (method !== 'ban' && method !== 'password-rotation') {
        throw new Error('--method must be either "ban" or "password-rotation".')
      }
      options.method = method
      index += 1
    } else if (argument === '--confirm-project-ref') {
      const projectRef = argv[index + 1]?.trim()
      if (!projectRef) throw new Error('--confirm-project-ref requires the exact Supabase project ref.')
      options.confirmedProjectRef = projectRef
      index += 1
    } else if (argument === '--preserve-email' || argument === '--preserve-emails') {
      const value = argv[index + 1]?.trim()
      if (!value) throw new Error(`${argument} requires at least one email address.`)
      const emails = value.split(',').map(normalizeEmail).filter(Boolean)
      options.preserveEmails.push(...emails)
      index += 1
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }

  if (options.verifyBan && options.apply) {
    throw new Error('--verify-ban is a standalone probe and cannot be combined with --apply.')
  }
  if (options.apply && !options.method) {
    throw new Error('--apply requires --method ban or --method password-rotation.')
  }
  if (!options.apply && options.method) {
    throw new Error('--method is only valid with --apply.')
  }
  if ((options.apply || options.verifyBan) && !options.confirmedProjectRef) {
    throw new Error('--apply and --verify-ban require --confirm-project-ref.')
  }

  return options
}

export function assertPilotTarget(
  supabaseUrl: string,
  environment: string | undefined,
  configuredProjectRef: string | undefined,
  confirmedProjectRef: string | null
): string {
  return assertSupabaseProjectTarget(supabaseUrl, environment, 'pilot', configuredProjectRef, confirmedProjectRef)
}

export function assertSupabaseProjectTarget(
  supabaseUrl: string,
  environment: string | undefined,
  expectedEnvironment: 'pilot' | 'demo',
  configuredProjectRef: string | undefined,
  confirmedProjectRef: string | null
): string {
  if ((environment ?? '').trim().toLowerCase() !== expectedEnvironment) {
    throw new Error(`Set VOILOOP_ENV=${expectedEnvironment} before running this operation.`)
  }
  if (!configuredProjectRef) {
    throw new Error(`Set ${expectedEnvironment === 'pilot' ? 'PILOT' : 'DEMO'}_SUPABASE_PROJECT_REF to the exact Supabase project ref.`)
  }

  let hostname: string
  try {
    hostname = new URL(supabaseUrl).hostname.toLowerCase()
  } catch {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL must be a valid URL.')
  }

  const match = /^([a-z0-9-]+)\.supabase\.co$/.exec(hostname)
  if (!match || match[1] !== configuredProjectRef.toLowerCase()) {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL does not match ${expectedEnvironment === 'pilot' ? 'PILOT' : 'DEMO'}_SUPABASE_PROJECT_REF.`)
  }
  if (confirmedProjectRef && confirmedProjectRef.toLowerCase() !== match[1]) {
    throw new Error('The confirmation project ref does not match NEXT_PUBLIC_SUPABASE_URL.')
  }
  return match[1]
}
