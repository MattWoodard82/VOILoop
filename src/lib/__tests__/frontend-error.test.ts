import { parseFrontendError } from '../frontend-error'

describe('parseFrontendError', () => {
  test('parses structured JSON error payloads', async () => {
    const response = new Response(JSON.stringify({
      error: 'Sign-in failed.',
      detail: 'Configured admin mismatch',
      details: ['Email did not match', 'Password expired'],
      code: 'INVALID_LOGIN_CREDENTIALS',
      requestId: 'req-123',
    }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })

    const parsed = await parseFrontendError(response, 'Fallback message')
    expect(parsed.message).toBe('Sign-in failed.')
    expect(parsed.detail).toBe(
      'Configured admin mismatch | Details: Email did not match; Password expired | Code: INVALID_LOGIN_CREDENTIALS | Request ID: req-123 | HTTP: 401'
    )
  })

  test('falls back to default message when JSON parsing fails', async () => {
    const response = new Response('not-json', {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })

    const parsed = await parseFrontendError(response, 'Request failed')
    expect(parsed.message).toBe('Request failed (HTTP 500)')
    expect(parsed.detail).toBe('HTTP: 500')
  })

  test('truncates long text error bodies', async () => {
    const longMessage = 'x'.repeat(700)
    const response = new Response(longMessage, {
      status: 502,
      headers: { 'content-type': 'text/html' },
    })

    const parsed = await parseFrontendError(response, 'Gateway error')
    expect(parsed.message.length).toBe(503)
    expect(parsed.message.endsWith('...')).toBe(true)
    expect(parsed.detail).toBe('HTTP: 502')
  })

  test('handles optional fields cleanly', async () => {
    const response = new Response(JSON.stringify({
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })

    const parsed = await parseFrontendError(response, 'Fallback message')
    expect(parsed.message).toBe('Unauthorized')
    expect(parsed.detail).toBe('Code: UNAUTHORIZED | HTTP: 401')
  })
})
