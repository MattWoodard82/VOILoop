import { backfillParticipantNamesFromAuthEmails, deriveNamesFromEmail, participantNeedsNameBackfill } from '../participant-linking'

describe('deriveNamesFromEmail', () => {
  test('reuses the participant-linking parser for single-token emails', () => {
    expect(deriveNamesFromEmail('pilot@example.com')).toEqual({
      firstName: 'Pilot',
      lastName: 'Account',
    })
  })

  test('splits multi-token emails into first and last names', () => {
    expect(deriveNamesFromEmail('heather.travis@example.com')).toEqual({
      firstName: 'Heather',
      lastName: 'Travis',
    })
  })
})

describe('participantNeedsNameBackfill', () => {
  test('flags blank or email-shaped names for repair', () => {
    expect(participantNeedsNameBackfill({ first_name: 'pilot@example.com', last_name: '' })).toBe(true)
    expect(participantNeedsNameBackfill({ first_name: 'Alice', last_name: 'Able' })).toBe(false)
  })
})

describe('backfillParticipantNamesFromAuthEmails', () => {
  test('repairs blank-name participants from auth emails without touching valid names', async () => {
    const updateEq = jest.fn(async () => ({ error: null }))
    const update = jest.fn(() => ({
      eq: updateEq,
    }))

    const adminClient = {
      auth: {
        admin: {
          getUserById: jest.fn(async (userId: string) => ({
            data: {
              user: {
                email: userId === 'user-1' ? 'pilot@example.com' : 'alice.able@example.com',
              },
            },
            error: null,
          })),
        },
      },
      from: jest.fn(() => ({
        select: jest.fn(async () => ({
          data: [
            { id: 'EMP001', auth_user_id: 'user-1', first_name: 'pilot@example.com', last_name: '' },
            { id: 'EMP002', auth_user_id: 'user-2', first_name: 'Alice', last_name: 'Able' },
          ],
          error: null,
        })),
        update,
      })),
    }

    await expect(backfillParticipantNamesFromAuthEmails(adminClient as never)).resolves.toBe(1)
    expect(update).toHaveBeenCalledWith({ first_name: 'Pilot', last_name: 'Account' })
    expect(updateEq).toHaveBeenCalledWith('id', 'EMP001')
    expect(adminClient.auth.admin.getUserById).toHaveBeenCalledTimes(1)
  })
})
