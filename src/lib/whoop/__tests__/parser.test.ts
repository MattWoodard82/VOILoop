import * as XLSX from 'xlsx'
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

  test('parses date-formatted XLSX cells as Date values', () => {
    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Sleep onset'],
      [new Date('2026-09-16T21:10:47.000Z')],
    ])
    worksheet.A2.z = 'yyyy-mm-dd hh:mm:ss'
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sleep')
    const buffer = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'buffer',
      cellDates: true,
    }) as Buffer

    const parsed = parseWorkbook(buffer)
    const row = parsed.Sleep[0]
    const timestamp = row['Sleep onset'] as Date

    expect(timestamp).toBeInstanceOf(Date)
    expect(Math.abs(timestamp.getTime() - Date.parse('2026-09-16T21:10:47.000Z'))).toBeLessThanOrEqual(1)
  })
})
