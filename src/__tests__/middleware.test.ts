import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { middleware } from '@/middleware'

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}))

describe('middleware role routing', () => {
  const mockCreateServerClient = createServerClient as jest.MockedFunction<typeof createServerClient>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('redirects participant users away from wellness director routes', async () => {
    mockCreateServerClient.mockReturnValue({
      auth: {
        getUser: jest.fn(async () => ({ data: { user: { id: 'user-1' } } })),
      },
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({
              data: { role: 'participant', must_change_password: false },
              error: null,
            })),
          })),
        })),
      })),
    } as never)

    const request = new NextRequest('https://example.com/wellness-director')
    const response = await middleware(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://example.com/my')
  })

  test('allows authenticated participant users on /admin/import', async () => {
    mockCreateServerClient.mockReturnValue({
      auth: {
        getUser: jest.fn(async () => ({ data: { user: { id: 'user-2' } } })),
      },
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({
              data: { role: 'participant', must_change_password: false },
              error: null,
            })),
          })),
        })),
      })),
    } as never)

    const request = new NextRequest('https://example.com/admin/import')
    const response = await middleware(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })

  test('redirects legacy admin events route to the canonical wellness director route', async () => {
    mockCreateServerClient.mockReturnValue({
      auth: {
        getUser: jest.fn(async () => ({ data: { user: { id: 'wd-1' } } })),
      },
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({
              data: { role: 'wellness_director', must_change_password: false },
              error: null,
            })),
          })),
        })),
      })),
    } as never)

    const request = new NextRequest('https://example.com/admin/events')
    const response = await middleware(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://example.com/wellness-director/events')
  })

  test('redirects participant users away from the canonical events route', async () => {
    mockCreateServerClient.mockReturnValue({
      auth: {
        getUser: jest.fn(async () => ({ data: { user: { id: 'user-3' } } })),
      },
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({
              data: { role: 'participant', must_change_password: false },
              error: null,
            })),
          })),
        })),
      })),
    } as never)

    const request = new NextRequest('https://example.com/wellness-director/events')
    const response = await middleware(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://example.com/my')
  })
})
