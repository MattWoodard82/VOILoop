export type AdminDiagnosticResult =
  | { status: 'found'; id: string }
  | { status: 'not_found' }
  | { status: 'error'; message: string }

interface AdminDiagnosticPayload {
  id?: unknown
  error?: unknown
}

export async function parseAdminDiagnosticResponse(response: Response): Promise<AdminDiagnosticResult> {
  const responseText = await response.text().catch(() => '')
  const trimmedText = responseText.trim()

  let payload: AdminDiagnosticPayload | null = null
  if (trimmedText) {
    try {
      payload = JSON.parse(trimmedText) as AdminDiagnosticPayload
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const hasDetail = trimmedText.length > 0
    return {
      status: 'error',
      message: hasDetail ? `HTTP ${response.status}: ${responseText}` : `HTTP ${response.status}`,
    }
  }

  const id = typeof payload?.id === 'string' ? payload.id.trim() : ''
  if (id) {
    return { status: 'found', id }
  }

  return { status: 'not_found' }
}
