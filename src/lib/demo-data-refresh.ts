import {
  normalizeEmail,
  PRESERVED_TEST_ACCOUNT_EMAIL,
  type PilotAuthUser,
} from './pilot-account-deactivation'

export const DEMO_REFRESH_CONFIRMATION_PHRASE = 'DELETE_PILOT_DATA'

export interface DemoRefreshOptions {
  apply: boolean
  confirmedProjectRef: string | null
  confirmationPhrase: string | null
  backupReference: string | null
  preserveEmails: string[]
}

export function parseDemoRefreshOptions(argv: string[]): DemoRefreshOptions {
  const options: DemoRefreshOptions = {
    apply: false,
    confirmedProjectRef: null,
    confirmationPhrase: null,
    backupReference: null,
    preserveEmails: [],
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--apply') {
      options.apply = true
    } else if (argument === '--confirm-project-ref') {
      options.confirmedProjectRef = argv[index + 1]?.trim() || null
      if (!options.confirmedProjectRef) throw new Error('--confirm-project-ref requires the exact Supabase project ref.')
      index += 1
    } else if (argument === '--confirm-demo-refresh') {
      options.confirmationPhrase = argv[index + 1]?.trim() || null
      if (!options.confirmationPhrase) throw new Error('--confirm-demo-refresh requires a confirmation phrase.')
      index += 1
    } else if (argument === '--backup-reference') {
      options.backupReference = argv[index + 1]?.trim() || null
      if (!options.backupReference) throw new Error('--backup-reference requires the verified manual backup reference.')
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

  if (options.apply) {
    if (!options.confirmedProjectRef) throw new Error('--apply requires --confirm-project-ref.')
    if (options.confirmationPhrase !== DEMO_REFRESH_CONFIRMATION_PHRASE) {
      throw new Error(`--apply requires --confirm-demo-refresh ${DEMO_REFRESH_CONFIRMATION_PHRASE}.`)
    }
    if (!options.backupReference || options.backupReference.length < 3) {
      throw new Error('--apply requires --backup-reference with the verified manual backup reference.')
    }
  } else if (options.confirmationPhrase || options.backupReference) {
    throw new Error('--confirm-demo-refresh and --backup-reference are only valid with --apply.')
  }

  return options
}

export function selectAuthUsersToDelete<T extends PilotAuthUser>(
  users: T[],
  adminEmail: string,
  extraPreservedEmails: string[] = []
): T[] {
  const normalizedAdminEmail = normalizeEmail(adminEmail)
  if (!normalizedAdminEmail) throw new Error('A configured admin email is required to preserve access.')
  if (normalizedAdminEmail === PRESERVED_TEST_ACCOUNT_EMAIL) {
    throw new Error('The configured admin cannot be the protected test account.')
  }

  const adminExists = users.some((user) => normalizeEmail(user.email) === normalizedAdminEmail)
  if (!adminExists) {
    throw new Error(`Configured demo admin ${normalizedAdminEmail} does not exist in this Supabase project; refusing data refresh.`)
  }
  if (!users.some(user => normalizeEmail(user.email) === PRESERVED_TEST_ACCOUNT_EMAIL)) {
    throw new Error('Protected test1@user.com account is absent; refusing data refresh.')
  }

  const retainedEmails = new Set([
    PRESERVED_TEST_ACCOUNT_EMAIL,
    normalizedAdminEmail,
    ...extraPreservedEmails.map(normalizeEmail),
  ])
  return users.filter((user) => !retainedEmails.has(normalizeEmail(user.email)))
}
