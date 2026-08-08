import { readFileSync } from 'fs'
import { join } from 'path'

function readSource(...segments: string[]) {
  return readFileSync(join(process.cwd(), 'src', ...segments), 'utf8')
}

describe('avatar helper usage', () => {
  test('team roster and pulse both consume the shared initials helper', () => {
    const teamRosterSource = readSource('app', 'team', 'TeamRosterClient.tsx')
    const pulseSource = readSource('app', 'pulse', 'page.tsx')

    expect(teamRosterSource).toMatch(/import\s+\{[^}]*initials[^}]*\}\s+from\s+'@\/lib\/utils'/)
    expect(teamRosterSource).toContain('initials(')
    expect(pulseSource).toMatch(/import\s+\{[^}]*initials[^}]*\}\s+from\s+'@\/lib\/utils'/)
    expect(pulseSource).toContain('initials(')
  })
})
