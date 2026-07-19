import fs from 'fs'
import path from 'path'

function listFilesRecursively(root: string): string[] {
  const entries = fs.readdirSync(root, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...listFilesRecursively(absolutePath))
      continue
    }
    files.push(absolutePath)
  }

  return files
}

describe('terminology guard', () => {
  test('contains no legacy employee term in source files', () => {
    const srcRoot = path.resolve(process.cwd(), 'src')
    const forbiddenTerm = `em${'ployee'}`
    const forbiddenPattern = new RegExp(`\\b${forbiddenTerm}\\b`, 'i')
    const allowedExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.sql'])

    const violations = listFilesRecursively(srcRoot)
      .filter((filePath) => allowedExtensions.has(path.extname(filePath)))
      .filter((filePath) => !filePath.endsWith(`${path.sep}terminology-guard.test.ts`))
      .filter((filePath) => forbiddenPattern.test(fs.readFileSync(filePath, 'utf8')))
      .map((filePath) => path.relative(srcRoot, filePath))

    expect(violations).toEqual([])
  })
})
