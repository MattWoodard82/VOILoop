import { parseAdminDiagnosticResponse } from '../login-diagnostic'

describe('parseAdminDiagnosticResponse', () => {
  test('surfaces the full backend 500 response body in the diagnostic message', async () => {
    const backendBody = JSON.stringify({
      id: null,
      error: 'Invalid API key',
      detail: 'SUPABASE_SERVICE_ROLE_KEY is missing',
      requestId: 'req-500',
    })

    const response = new Response(backendBody, {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })

    const parsed = await parseAdminDiagnosticResponse(response)
    expect(parsed).toEqual({
      status: 'error',
      message: `HTTP 500: ${backendBody}`,
    })
  })
})
