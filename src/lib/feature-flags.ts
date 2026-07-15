function isEnabled(raw: string | undefined): boolean {
  const value = (raw ?? '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

export function isPilotChallengesBasicEnabled(): boolean {
  return isEnabled(process.env.PILOT_CHALLENGES_BASIC)
}

export function isPublicErrorDiagnosticsEnabled(): boolean {
  return isEnabled(process.env.NEXT_PUBLIC_SHOW_ERROR_DIAGNOSTICS)
}
