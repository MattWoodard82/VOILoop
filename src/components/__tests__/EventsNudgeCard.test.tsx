import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const mockUseEffect = jest.fn()
const mockUseState = jest.fn()

jest.mock('react', () => {
  const actual = jest.requireActual('react')
  return {
    ...actual,
    useEffect: (callback: () => void) => mockUseEffect(callback),
    useState: (initialValue: unknown) => mockUseState(initialValue),
  }
})

describe('EventsNudgeCard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('renders load error message when fetch state has an error', async () => {
    mockUseState
      .mockReturnValueOnce([[], jest.fn()]) // events
      .mockReturnValueOnce([null, jest.fn()]) // nudge
      .mockReturnValueOnce([null, jest.fn()]) // acknowledgement
      .mockReturnValueOnce([[], jest.fn()]) // rsvps
      .mockReturnValueOnce([false, jest.fn()]) // loading
      .mockReturnValueOnce(['Events card failed to load. Detail: Request failed (500)', jest.fn()]) // error

    const { EventsNudgeCard } = await import('../EventsNudgeCard')
    const markup = renderToStaticMarkup(React.createElement(EventsNudgeCard))

    expect(markup).toContain('Events card failed to load. Detail: Request failed (500)')
  })

  test('renders nudge acknowledgement prompt and upcoming event details', async () => {
    mockUseState
      .mockReturnValueOnce([[{
        id: 'evt-1',
        title: 'Walk Club',
        description: 'Bring water',
        event_date: '2099-08-10',
        event_time: '8:00 AM',
        location: 'Trailhead',
        event_type: 'fitness',
        recurring: true,
        recurrence: 'Weekly',
        rsvp_enabled: true,
      }], jest.fn()]) // events
      .mockReturnValueOnce([{ id: 'nudge-1', message: 'Hydrate today', author: 'Coach', week_of: '2099-08-04' }, jest.fn()]) // nudge
      .mockReturnValueOnce([null, jest.fn()]) // acknowledgement
      .mockReturnValueOnce([['evt-1'], jest.fn()]) // rsvps
      .mockReturnValueOnce([false, jest.fn()]) // loading
      .mockReturnValueOnce(['', jest.fn()]) // error

    const { EventsNudgeCard } = await import('../EventsNudgeCard')
    const markup = renderToStaticMarkup(React.createElement(EventsNudgeCard))

    expect(markup).toContain('This week&#x27;s focus')
    expect(markup).toContain('Hydrate today')
    expect(markup).toContain('Open-text response required within 48 hours.')
    expect(markup).toContain('Upcoming events')
    expect(markup).toContain('Walk Club')
    expect(markup).toContain('Bring water')
    expect(markup).toContain('✓ Going')
    expect(markup).toContain('Weekly')
  })
})
