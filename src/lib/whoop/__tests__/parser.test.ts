import { parseWorkbook } from '../parser'

describe('parseWorkbook', () => {
  test('preserves timezone-less WHOOP CSV timestamps as local wall-clock strings', () => {
    const csv = [
      'Participant Identifier,Sleep onset,Wake onset,Cycle timezone',
      'EMP012,2026-09-16 21:10:47,2026-09-17 05:29:19,UTC-06:00',
    ].join('\n')

    const workbook = parseWorkbook(Buffer.from(csv))
    const row = workbook[Object.keys(workbook)[0]][0]

    expect(row['Sleep onset']).toBe('2026-09-16 21:10:47')
    expect(row['Wake onset']).toBe('2026-09-17 05:29:19')
    expect(row['Cycle timezone']).toBe('UTC-06:00')
  })
})
