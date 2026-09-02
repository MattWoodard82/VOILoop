// Pilot/test participant accounts are seeded with emails like test1@user.com,
// test23@user.com, etc. (see seed.ts / provision-account.ts). These accounts
// should never pollute cohort-wide Wellness Director metrics (Average Weighted
// Score, KPIs, dropdowns/filters) — see GH issue for "fix-test-account-pollution".
//
// The pattern is intentionally anchored (`^test\d+@`) so it only matches emails
// whose local part is literally "test" followed by one or more digits, e.g.
// test1@user.com or TEST9@USER.COM — not emails like testing@user.com or
// contest1@user.com where "test" is just a substring.
const TEST_ACCOUNT_EMAIL_PATTERN = /^test\d+@/i

export function isTestAccountEmail(email: string): boolean {
  if (!email) return false
  return TEST_ACCOUNT_EMAIL_PATTERN.test(email.trim())
}
