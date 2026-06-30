const DEFAULT_ROUTES = [
  '/',
  '/executive',
  '/team',
  '/interventions',
  '/outcomes',
  '/admin/import',
]

const baseUrl = process.argv[2] || process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const routes = process.argv.slice(3)
const routesToCheck = routes.length > 0 ? routes : DEFAULT_ROUTES

function joinUrl(base, route) {
  return `${base.replace(/\/+$/, '')}/${route.replace(/^\/+/, '')}`
}

async function checkRoute(url) {
  const res = await fetch(url, { redirect: 'manual' })
  if (res.status >= 500) {
    throw new Error(`HTTP ${res.status}`)
  }
  return res.status
}

async function main() {
  const failures = []

  for (const route of routesToCheck) {
    const url = joinUrl(baseUrl, route)
    try {
      const status = await checkRoute(url)
      console.log(`PASS ${route} (${status})`)
    } catch (error) {
      failures.push(`${route} => ${String(error)}`)
      console.error(`FAIL ${route}: ${String(error)}`)
    }
  }

  if (failures.length > 0) {
    console.error('\nSmoke check failures:')
    for (const failure of failures) {
      console.error(`- ${failure}`)
    }
    process.exit(1)
  }

  console.log('\nAll demo routes responded without server errors.')
}

main().catch((error) => {
  console.error(`Smoke check crashed: ${String(error)}`)
  process.exit(1)
})
