import { prepareWhoopWorkbookForImport } from '../workbook-context'
import type { ParsedWorkbook } from '../parser'

describe('prepareWhoopWorkbookForImport', () => {
  test('injects the matched employee id from the condensed sheet into tabs that omit it', async () => {
    const workbook: ParsedWorkbook = {
      'Condensed Employee Metrics': [
        {
          'Employee Identifier': 'WHOOP-123',
          'Employee Name ': 'Travis Brandenburgh',
          Department: 'Operations',
        },
      ],
      Exercise: [
        {
          'Workout start time': '2024-01-15 08:00:00',
          'Activity name': 'Running',
        },
      ],
      Sleep: [
        {
          'Cycle start time': '2024-01-14 22:41:02',
          'Wake onset': '2024-01-15 07:15:00',
        },
      ],
      'Manual Entries': [
        {
          'Cycle start time': '2024-01-14 22:41:02',
          'Question text': 'Did you drink alcohol?',
          'Answered yes': 'no',
        },
      ],
    }

    const supabase = {
      from: jest.fn((table: string) => {
        if (table !== 'employees') {
          throw new Error(`Unexpected table ${table}`)
        }

        return {
          select: jest.fn(async () => ({
            data: [{ id: 'EMP001', first_name: 'Travis', last_name: 'Brandenburgh' }],
            error: null,
          })),
        }
      }),
    } as never

    const prepared = await prepareWhoopWorkbookForImport(supabase, workbook)

    expect(prepared.employeeProfiles).toEqual([
      expect.objectContaining({
        employeeId: 'EMP001',
        sourceIdentifier: 'WHOOP-123',
        fullName: 'Travis Brandenburgh',
      }),
    ])
    expect(prepared.workbook.Exercise?.[0]['Employee Identifier']).toBe('EMP001')
    expect(prepared.workbook.Sleep?.[0]['Employee Identifier']).toBe('EMP001')
    expect(prepared.workbook['Manual Entries']?.[0]['Employee Identifier']).toBe('EMP001')
  })

  test('uses the logged-in user employee record when the workbook has no identity rows', async () => {
    const workbook: ParsedWorkbook = {
      'Condensed Employee Metrics': [],
      Exercise: [
        {
          'Workout start time': '2024-01-15 08:00:00',
          'Activity name': 'Running',
        },
      ],
    }

    const supabase = {
      from: jest.fn((table: string) => {
        if (table !== 'employees') {
          throw new Error(`Unexpected table ${table}`)
        }

        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({
                data: {
                  id: 'EMP005',
                  auth_user_id: 'user-5',
                  first_name: 'Colin',
                  last_name: 'Stephenson',
                  department: 'Night Shift',
                  device_id: 'WHP-005',
                },
                error: null,
              })),
            })),
          })),
        }
      }),
    } as never

    const prepared = await prepareWhoopWorkbookForImport(supabase, workbook, 'user-5')

    expect(prepared.employeeProfiles).toEqual([
      expect.objectContaining({
        employeeId: 'EMP005',
        fullName: 'Colin Stephenson',
      }),
    ])
    expect(prepared.workbook.Exercise?.[0]['Employee Identifier']).toBe('EMP005')
  })

  test('overwrites workbook employee ids with the logged-in user employee id', async () => {
    const workbook: ParsedWorkbook = {
      Exercise: [
        {
          'Employee Identifier': 'WHOOP-OTHER',
          'Workout start time': '2024-01-15 08:00:00',
          'Activity name': 'Running',
        },
      ],
    }

    const supabase = {
      from: jest.fn((table: string) => {
        if (table !== 'employees') {
          throw new Error(`Unexpected table ${table}`)
        }

        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({
                data: {
                  id: 'EMP001',
                  auth_user_id: 'user-1',
                  first_name: 'Travis',
                  last_name: 'Brandenburgh',
                  department: 'Manager',
                  device_id: 'WHP-001',
                },
                error: null,
              })),
            })),
          })),
        }
      }),
    } as never

    const prepared = await prepareWhoopWorkbookForImport(supabase, workbook, 'user-1')
    expect(prepared.workbook.Exercise?.[0]['Employee Identifier']).toBe('EMP001')
  })
})
