import * as XLSX from 'xlsx'

export const TAB_EXERCISE = 'Exercise'
export const TAB_STRESS = 'Stress'
export const TAB_SLEEP = 'Sleep'
export const TAB_MANUAL = 'Manual Entries'
export const TAB_CONDENSED = 'Condensed Participant Metrics'

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
    // WHOOP CSV timestamps are local wall-clock text with the offset supplied
    // separately in "Cycle timezone". Converting them to Date here applies the
    // server timezone before validation and can collapse distinct local nights.
    cellDates: false,
    raw: true,
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
