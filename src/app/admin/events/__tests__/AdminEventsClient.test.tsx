import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const mockUseEffect = jest.fn()
const mockUseRef = jest.fn()
const mockUseState = jest.fn()

jest.mock('react', () => {
  const actual = jest.requireActual('react')
  return {
    ...actual,
    useEffect: (callback: () => void) => mockUseEffect(callback),
    useRef: (initialValue: unknown) => mockUseRef(initialValue),
    useState: (initialValue: unknown) => mockUseState(initialValue),
  }
})

describe('AdminEventsClient', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseRef.mockReturnValue({ current: null })
  })

  test('renders RSVP names in upcoming events', async () => {
    mockUseState
      .mockReturnValueOnce([[{
        id: 'evt-1',
        title: 'Morning Run',
        description: 'Meet at the trailhead',
        event_date: '2099-08-10',
        event_time: '7:00 AM',
        location: 'Foothills',
        event_type: 'outdoor',
        recurring: false,
        recurrence: null,
        rsvps: [
          { participant_id: 'p-1', first_name: 'Jane', last_name: 'Doe' },
          { participant_id: 'p-2', first_name: 'John', last_name: 'Smith' },
        ],
      }], jest.fn()])
      .mockReturnValueOnce([[], jest.fn()]) // nudges
      .mockReturnValueOnce([[], jest.fn()]) // acknowledgements
      .mockReturnValueOnce(['events', jest.fn()]) // tab
      .mockReturnValueOnce([false, jest.fn()]) // saving
      .mockReturnValueOnce([false, jest.fn()]) // saved
      .mockReturnValueOnce(['', jest.fn()]) // error
      .mockReturnValueOnce([{ title: '', description: '', event_date: '', event_time: '', location: '', event_type: 'general', recurring: false, recurrence: '' }, jest.fn()]) // newEvent
      .mockReturnValueOnce(['', jest.fn()]) // nudgeMsg
      .mockReturnValueOnce(['Heather Simpson', jest.fn()]) // nudgeAuthor
      .mockReturnValueOnce(['all', jest.fn()]) // nudgeTargetType
      .mockReturnValueOnce(['', jest.fn()]) // nudgeTargetLabel
      .mockReturnValueOnce(['', jest.fn()]) // nudgeParticipantId

    const { AdminEventsClient } = await import('../AdminEventsClient')
    const markup = renderToStaticMarkup(React.createElement(AdminEventsClient, { participants: [] }))

    expect(markup).toContain('RSVPs · 2')
    expect(markup).toContain('Jane Doe, John Smith')
    expect(markup).toContain('Morning Run')
  })
})
