import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseFrontendError } from '@/lib/frontend-error'

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

jest.mock('@/lib/frontend-error', () => ({
  parseFrontendError: jest.fn(),
}))
jest.mock('@/components/ui', () => {
  const React = require('react')
  return {
    Card: ({ title, badge, children }: { title?: React.ReactNode; badge?: React.ReactNode; children: React.ReactNode }) => React.createElement('section', null, title, badge, children),
    LoadingNotice: ({ children }: { children?: React.ReactNode }) => React.createElement('span', null, children ?? 'Loading…'),
    SkeletonBlock: () => React.createElement('div', { className: 'skeleton-block' }),
    SkeletonText: () => React.createElement('div', { className: 'skeleton-block' }),
  }
})

const mockParseFrontendError = parseFrontendError as jest.Mock

// The component's state and event handlers are plain closures created each
// render, so we can invoke a handler directly by calling the component
// function ourselves and walking the returned element tree for the onClick
// prop we want — no DOM/testing-library needed given this project's
// testEnvironment: 'node' Jest setup (see other tests in this file).
function findElementByOnClickName(node: unknown, name: string): { props: { onClick: () => unknown } } | null {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElementByOnClickName(child, name)
      if (found) return found
    }
    return null
  }
  const element = node as { props?: { onClick?: unknown; children?: unknown } }
  if (element.props) {
    if (typeof element.props.onClick === 'function' && element.props.onClick.name === name) {
      return element as { props: { onClick: () => unknown } }
    }
    return findElementByOnClickName(element.props.children, name)
  }
  return null
}

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
      .mockReturnValueOnce([false, jest.fn()]) // showAckModal
      .mockReturnValueOnce(['', jest.fn()]) // ackText
      .mockReturnValueOnce([false, jest.fn()]) // ackSubmitting

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
      .mockReturnValueOnce([false, jest.fn()]) // showAckModal
      .mockReturnValueOnce(['', jest.fn()]) // ackText
      .mockReturnValueOnce([false, jest.fn()]) // ackSubmitting

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

  test('renders stable skeleton shells while card data is loading', async () => {
    mockUseState
      .mockReturnValueOnce([[], jest.fn()]) // events
      .mockReturnValueOnce([null, jest.fn()]) // nudge
      .mockReturnValueOnce([null, jest.fn()]) // acknowledgement
      .mockReturnValueOnce([[], jest.fn()]) // rsvps
      .mockReturnValueOnce([true, jest.fn()]) // loading
      .mockReturnValueOnce(['', jest.fn()]) // error
      .mockReturnValueOnce([false, jest.fn()]) // showAckModal
      .mockReturnValueOnce(['', jest.fn()]) // ackText
      .mockReturnValueOnce([false, jest.fn()]) // ackSubmitting

    const { EventsNudgeCard } = await import('../EventsNudgeCard')
    const markup = renderToStaticMarkup(React.createElement(EventsNudgeCard))

    expect(markup).toContain('This week&#x27;s focus')
    expect(markup).toContain('Upcoming events')
    expect(markup).toContain('skeleton-block')
  })

  test('submitAcknowledgement shows the parsed structured error message when the PATCH fails', async () => {
    const setError = jest.fn()
    const setAckSubmitting = jest.fn()

    mockUseState
      .mockReturnValueOnce([[], jest.fn()]) // events
      .mockReturnValueOnce([{ id: 'nudge-1', message: 'Hydrate today', author: 'Coach', week_of: '2099-08-04' }, jest.fn()]) // nudge
      .mockReturnValueOnce([null, jest.fn()]) // acknowledgement
      .mockReturnValueOnce([[], jest.fn()]) // rsvps
      .mockReturnValueOnce([false, jest.fn()]) // loading
      .mockReturnValueOnce(['', setError]) // error
      .mockReturnValueOnce([true, jest.fn()]) // showAckModal
      .mockReturnValueOnce(['Will do', jest.fn()]) // ackText
      .mockReturnValueOnce([false, setAckSubmitting]) // ackSubmitting

    mockParseFrontendError.mockResolvedValue({
      message: 'Unable to save nudge acknowledgement.',
      detail: 'HTTP: 500',
    })

    const failedResponse = { ok: false, status: 500 }
    const fetchMock = jest.fn().mockResolvedValue(failedResponse)
    const originalFetch = global.fetch
    global.fetch = fetchMock as unknown as typeof global.fetch

    try {
      const { EventsNudgeCard } = await import('../EventsNudgeCard')
      const element = EventsNudgeCard() as unknown
      const sendButton = findElementByOnClickName(element, 'submitAcknowledgement')
      expect(sendButton).not.toBeNull()

      await sendButton!.props.onClick()

      expect(fetchMock).toHaveBeenCalledWith('/api/participant/events', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ nudgeId: 'nudge-1', responseText: 'Will do' }),
      }))
      expect(mockParseFrontendError).toHaveBeenCalledWith(failedResponse, 'Nudge acknowledgement failed.')
      expect(setError).toHaveBeenCalledWith('Unable to save nudge acknowledgement.. Detail: HTTP: 500')
      expect(setAckSubmitting).toHaveBeenCalledWith(false)
    } finally {
      global.fetch = originalFetch
    }
  })
})
