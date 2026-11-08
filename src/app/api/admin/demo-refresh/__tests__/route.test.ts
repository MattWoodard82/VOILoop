import { POST } from '../route'
import { requireAdmin } from '@/lib/supabase/server'
import { refreshDemoStory } from '@/lib/demo-story-refresh'
import { revalidatePath } from 'next/cache'
import { DEMO_REFRESH_CONFIRMATION } from '@/lib/demo-story'

jest.mock('@/lib/supabase/server', () => ({ requireAdmin: jest.fn() }))
jest.mock('@/lib/demo-story-refresh', () => ({ refreshDemoStory: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

describe('admin demo refresh POST', () => {
  function request(confirmation: unknown = DEMO_REFRESH_CONFIRMATION, origin = 'https://demo.test', host = 'demo.test') {
    return new Request('https://demo.test/api/admin/demo-refresh', {
      method: 'POST', headers: { origin, host, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation }),
    })
  }
  beforeEach(() => {
    jest.resetAllMocks()
    jest.mocked(requireAdmin).mockResolvedValue({ role: 'admin' } as Awaited<ReturnType<typeof requireAdmin>>)
    jest.mocked(refreshDemoStory).mockResolvedValue({ anchor: '2026-11-04', pulse_count: 400, recovery_count: 3000 })
  })

  test('rejects unauthenticated/non-admin callers without touching demo data', async () => {
    jest.mocked(requireAdmin).mockResolvedValue({ redirect: '/login' })
    expect((await POST(request())).status).toBe(403)
    expect(refreshDemoStory).not.toHaveBeenCalled()
  })
  test('rejects missing confirmation and cross-origin requests', async () => {
    expect((await POST(request(false))).status).toBe(400)
    expect((await POST(request(DEMO_REFRESH_CONFIRMATION, 'https://evil.test'))).status).toBe(403)
    expect((await POST(request(DEMO_REFRESH_CONFIRMATION, ''))).status).toBe(403)
    expect((await POST(request(DEMO_REFRESH_CONFIRMATION, 'https://evil.test', 'demo.test'))).status).toBe(403)
    expect((await POST(request(DEMO_REFRESH_CONFIRMATION, 'http://demo.test'))).status).toBe(403)
    expect(refreshDemoStory).not.toHaveBeenCalled()
  })
  test('accepts the externally requested host rather than the internal Next.js URL', async () => {
    const response = await POST(new Request('http://localhost:3100/api/admin/demo-refresh', {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:3100', host: '127.0.0.1:3100', 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: DEMO_REFRESH_CONFIRMATION }),
    }))
    expect(response.status).toBe(200)
  })
  test('accepts a trusted HTTPS proxy protocol and rejects a different origin', async () => {
    const makeRequest = (origin: string) => new Request('http://localhost/api/admin/demo-refresh', {
      method: 'POST',
      headers: { origin, host: 'demo.test', 'x-forwarded-proto': 'https', 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: DEMO_REFRESH_CONFIRMATION }),
    })
    expect((await POST(makeRequest('https://demo.test'))).status).toBe(200)
    expect((await POST(makeRequest('http://demo.test'))).status).toBe(403)
  })
  test('returns committed counts and revalidates affected pages', async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ anchor: '2026-11-04', pulse_count: 400, recovery_count: 3000 })
    expect(revalidatePath).toHaveBeenCalledWith('/pulse')
    expect(revalidatePath).toHaveBeenCalledWith('/outcomes')
  })
  test('exposes a failed refresh and does not revalidate as if successful', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.mocked(refreshDemoStory).mockRejectedValue(new Error('Refresh rolled back'))
    const response = await POST(request())
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Refresh rolled back' })
    expect(revalidatePath).not.toHaveBeenCalled()
    log.mockRestore()
  })
})
