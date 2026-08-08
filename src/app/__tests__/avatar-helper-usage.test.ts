import { readFileSync } from 'fs'
import { join } from 'path'

function readSource(...segments: string[]) {
  return readFileSync(join(process.cwd(), 'src', ...segments), 'utf8')
}

describe('avatar helper usage', () => {
  test('pulse consumes the shared initials helper', () => {
    const pulseSource = readSource('app', 'pulse', 'page.tsx')

    expect(pulseSource).toMatch(/import\s+\{[^}]*initials[^}]*\}\s+from\s+'@\/lib\/utils'/)
    expect(pulseSource).toContain('initials(')
  })
})
