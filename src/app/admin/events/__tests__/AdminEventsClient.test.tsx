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
jest.mock('@/components/ui', () => {
  const React = require('react')
  return {
    Card: ({ title, badge, children }: { title?: React.ReactNode; badge?: React.ReactNode; children: React.ReactNode }) => React.createElement('section', null, title, badge, children),
    LoadingNotice: ({ children }: { children?: React.ReactNode }) => React.createElement('span', null, children ?? 'Loading…'),
    SkeletonBlock: () => React.createElement('div', { className: 'skeleton-block' }),
    SkeletonText: () => React.createElement('div', { className: 'skeleton-block' }),
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
      .mockReturnValueOnce([0, jest.fn()]) // acknowledgementsTotal
      .mockReturnValueOnce(['events', jest.fn()]) // tab
      .mockReturnValueOnce([false, jest.fn()]) // saving
      .mockReturnValueOnce([false, jest.fn()]) // saved
      .mockReturnValueOnce(['', jest.fn()]) // error
      .mockReturnValueOnce([false, jest.fn()]) // loading
      .mockReturnValueOnce([{ title: '', description: '', event_date: '', event_time: '', location: '', event_type: 'general', recurring: false, recurrence: '' }, jest.fn()]) // newEvent
      .mockReturnValueOnce(['', jest.fn()]) // nudgeMsg
      .mockReturnValueOnce(['Heather Simpson', jest.fn()]) // nudgeAuthor
      .mockReturnValueOnce(['all', jest.fn()]) // nudgeTargetType
      .mockReturnValueOnce(['', jest.fn()]) // nudgeTargetLabel
      .mockReturnValueOnce(['', jest.fn()]) // nudgeParticipantId

    const { AdminEventsClient } = await import('../AdminEventsClient')
    const markup = renderToStaticMarkup(React.createElement(AdminEventsClient, { participants: [], role: 'wellness_director' }))

    expect(markup).toContain('RSVPs · 2')
    expect(markup).toContain('Jane Doe, John Smith')
    expect(markup).toContain('Morning Run')
  })

  test('renders loading skeletons instead of empty panels on first load', async () => {
    mockUseState
      .mockReturnValueOnce([[], jest.fn()]) // events
      .mockReturnValueOnce([[], jest.fn()]) // nudges
      .mockReturnValueOnce([[], jest.fn()]) // acknowledgements
      .mockReturnValueOnce([0, jest.fn()]) // acknowledgementsTotal
      .mockReturnValueOnce(['events', jest.fn()]) // tab
      .mockReturnValueOnce([false, jest.fn()]) // saving
      .mockReturnValueOnce([false, jest.fn()]) // saved
      .mockReturnValueOnce(['', jest.fn()]) // error
      .mockReturnValueOnce([true, jest.fn()]) // loading
      .mockReturnValueOnce([{ title: '', description: '', event_date: '', event_time: '', location: '', event_type: 'general', recurring: false, recurrence: '' }, jest.fn()]) // newEvent
      .mockReturnValueOnce(['', jest.fn()]) // nudgeMsg
      .mockReturnValueOnce(['Heather Simpson', jest.fn()]) // nudgeAuthor
      .mockReturnValueOnce(['all', jest.fn()]) // nudgeTargetType
      .mockReturnValueOnce(['', jest.fn()]) // nudgeTargetLabel
      .mockReturnValueOnce(['', jest.fn()]) // nudgeParticipantId

    const { AdminEventsClient } = await import('../AdminEventsClient')
    const markup = renderToStaticMarkup(React.createElement(AdminEventsClient, { participants: [], role: 'admin' }))

    expect(markup).toContain('Upcoming events')
    expect(markup).toContain('skeleton-block')
  })

  test('shows full participant text on hover for truncated nudge-target options', async () => {
    mockUseState
      .mockReturnValueOnce([[], jest.fn()]) // events
      .mockReturnValueOnce([[], jest.fn()]) // nudges
      .mockReturnValueOnce([[], jest.fn()]) // acknowledgements
      .mockReturnValueOnce([0, jest.fn()]) // acknowledgementsTotal
      .mockReturnValueOnce(['nudge', jest.fn()]) // tab
      .mockReturnValueOnce([false, jest.fn()]) // saving
      .mockReturnValueOnce([false, jest.fn()]) // saved
      .mockReturnValueOnce(['', jest.fn()]) // error
      .mockReturnValueOnce([false, jest.fn()]) // loading
      .mockReturnValueOnce([{ title: '', description: '', event_date: '', event_time: '', location: '', event_type: 'general', recurring: false, recurrence: '' }, jest.fn()]) // newEvent
      .mockReturnValueOnce(['', jest.fn()]) // nudgeMsg
      .mockReturnValueOnce(['Heather Simpson', jest.fn()]) // nudgeAuthor
      .mockReturnValueOnce(['participant', jest.fn()]) // nudgeTargetType
      .mockReturnValueOnce(['', jest.fn()]) // nudgeTargetLabel
      .mockReturnValueOnce(['p-1', jest.fn()]) // nudgeParticipantId

    const participants = [
      { id: 'p-1', label: 'Jane Doe Extremely Long Name That Truncates', meta: 'jane.doe.extremely.long@example.com' },
    ]

    const { AdminEventsClient } = await import('../AdminEventsClient')
    const markup = renderToStaticMarkup(React.createElement(AdminEventsClient, { participants, role: 'admin' }))

    expect(markup).toContain('title="Jane Doe Extremely Long Name That Truncates · jane.doe.extremely.long@example.com · p-1"')
  })
})
