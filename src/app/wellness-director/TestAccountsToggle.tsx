'use client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

// Server-side, getTeamDashboard excludes pilot/test accounts (emails matching
// /^test\d+@/i) by default. This toggle lets the Wellness Director opt OUT of
// that exclusion for the current page load by adding ?includeTestAccounts=1
// to the URL, which the (server component) page reads via searchParams and
// threads through to getTeamDashboard({ includeTestAccounts: true }).
// Default state (no query param, or includeTestAccounts != '1') is "excluded",
// matching the current/default dashboard behavior.
export function TestAccountsToggle() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const excluded = searchParams.get('includeTestAccounts') !== '1'

  function handleToggle(e: React.ChangeEvent<HTMLInputElement>) {
    const params = new URLSearchParams(searchParams.toString())
    if (e.target.checked) {
      params.delete('includeTestAccounts')
    } else {
      params.set('includeTestAccounts', '1')
    }
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        color: '#A5ACAF',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <input type="checkbox" checked={excluded} onChange={handleToggle} aria-label="Exclude test & pilot accounts" />
      Exclude test &amp; pilot accounts
    </label>
  )
}
