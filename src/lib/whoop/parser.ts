import * as XLSX from 'xlsx'

export const TAB_EXERCISE = 'Exercise'
export const TAB_STRESS = 'Stress'
export const TAB_SLEEP = 'Sleep'
export const TAB_MANUAL = 'Manual Entries'
export const TAB_CONDENSED = 'Condensed Employee Metrics'

export const REQUIRED_TABS = [TAB_EXERCISE] as const
export const AT_LEAST_ONE_TABS = [TAB_STRESS, TAB_SLEEP] as const

/** Parsed workbook: map from sheet name → array of row objects */
export type ParsedWorkbook = Record<string, Record<string, unknown>[]>

/**
 * Parse an xlsx or csv buffer into a map of sheet-name → row objects.
 * Each row object uses XLSX's default header-row-based conversion.
 */
export function parseWorkbook(buffer: Buffer): ParsedWorkbook {
  const wb = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: true,   // parse date cells as JS Date objects
    raw: false,        // format numbers as strings where needed
    dateNF: 'yyyy-mm-dd hh:mm:ss',
  })

  const result: ParsedWorkbook = {}
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    result[sheetName] = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      defval: null,
      raw: true,
    })
  }
  return result
}

/** Return list of sheet names present in the workbook */
export function getSheetNames(buffer: Buffer): string[] {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  return wb.SheetNames
}
