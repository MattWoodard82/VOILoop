export interface ParsedFrontendError {
  message: string
  detail: string
}

interface ApiErrorPayload {
  error?: unknown
  code?: unknown
  detail?: unknown
  details?: unknown
  requestId?: unknown
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

export async function parseFrontendError(response: Response, fallbackMessage: string): Promise<ParsedFrontendError> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  let payload: ApiErrorPayload | null = null
  let rawText: string | null = null

  if (contentType.includes('application/json')) {
    payload = await response.json().catch(() => null)
  } else {
    rawText = await response.text().catch(() => null)
  }

  const message = asString(payload?.error) ?? asString(rawText) ?? `${fallbackMessage} (HTTP ${response.status})`
  const detailsArray = Array.isArray(payload?.details)
    ? payload?.details.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : []
  const detailParts = [
    asString(payload?.detail),
    detailsArray.length ? `Details: ${detailsArray.join('; ')}` : null,
    asString(payload?.code) ? `Code: ${asString(payload?.code)}` : null,
    asString(payload?.requestId) ? `Request ID: ${asString(payload?.requestId)}` : null,
    `HTTP: ${response.status}`,
  ].filter((entry): entry is string => Boolean(entry))

  return {
    message,
    detail: detailParts.join(' | '),
  }
}
