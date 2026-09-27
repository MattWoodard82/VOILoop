import { useEffect, useState } from 'react'

const mockUseEffect = useEffect as jest.MockedFunction<typeof useEffect>
const mockUseState = useState as jest.MockedFunction<typeof useState>

jest.mock('react', () => {
  const actual = jest.requireActual('react')
  return {
    ...actual,
    useEffect: jest.fn((callback: () => void | (() => void)) => callback()),
    useState: jest.fn(),
  }
})

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => ({ get: jest.fn().mockReturnValue(null) }),
}))

jest.mock('next/link', () => {
  const React = require('react')
  function MockNextLink({ children, ...props }: { children: React.ReactNode }) {
    return React.createElement('a', props, children)
  }
  return MockNextLink
})

jest.mock('recharts', () => {
  const React = require('react')
  function MockRechartsComponent({ children }: { children?: React.ReactNode }) {
    return React.createElement('div', null, children)
  }
  return {
    Line: MockRechartsComponent,
    LineChart: MockRechartsComponent,
    ResponsiveContainer: MockRechartsComponent,
    Tooltip: MockRechartsComponent,
    XAxis: MockRechartsComponent,
    YAxis: MockRechartsComponent,
    CartesianGrid: MockRechartsComponent,
  }
})

jest.mock('@/components/ui/InfoTooltip', () => ({
  InfoTooltip: function MockInfoTooltip() {
    return null
  },
}))

jest.mock('@/components/WellnessDirectorCard', () => ({
  WellnessDirectorCard: function MockWellnessDirectorCard() {
    return null
  },
}))

jest.mock('@/components/EventsNudgeCard', () => ({
  EventsNudgeCard: function MockEventsNudgeCard() {
    return null
  },
}))

jest.mock('@/components/ui', () => {
  const React = require('react')
  function MockUiComponent({ children }: { children?: React.ReactNode }) {
    return React.createElement('div', null, children)
  }
  return {
    Alert: MockUiComponent,
    Badge: MockUiComponent,
    Card: MockUiComponent,
    KpiCard: MockUiComponent,
  }
})

jest.mock('@/lib/utils', () => ({
  formatDate: jest.fn((value: string) => value),
  recoveryColor: jest.fn(() => '#69BE28'),
  sleepColor: jest.fn(() => '#69BE28'),
}))

const baseProps = {
  participant: {
    id: 'participant-1',
    auth_user_id: 'auth-1',
    first_name: 'Taylor',
    last_name: 'Jordan',
    department: 'Operations',
    location_id: null,
    employment_type: null,
    title: 'Coordinator',
    device_id: null,
    consent: true,
    enrolled_date: '2099-08-01',
    status: 'active',
    is_exact_data: false,
  },
  wellness: [],
  habits: null,
  workout: null,
  pulse: [],
  insights: {
    baselineComparisons: [],
    streaks: [],
    bests: [],
    trends: [],
    window: null,
  },
  challenge: null,
  importBatches: [],
}

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('MyDashboardClient participant events loading', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('loads participant events once and stores the shared dashboard payload', async () => {
    const setPulseDoneBanner = jest.fn()
    const setParticipantEvents = jest.fn()
    const setParticipantEventsLoading = jest.fn()
    const setParticipantEventsError = jest.fn()

    mockUseState
      .mockReturnValueOnce([false, setPulseDoneBanner])
      .mockReturnValueOnce([null, setParticipantEvents])
      .mockReturnValueOnce([true, setParticipantEventsLoading])
      .mockReturnValueOnce(['', setParticipantEventsError])

    const payload = {
      events: [],
      nudge: { id: 'n1', message: 'Hydrate today', author: 'Coach Heather', week_of: '2099-08-04' },
      acknowledgement: null,
      history: [],
      rsvpEventIds: [],
    }

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(payload),
    })
    const originalFetch = global.fetch
    global.fetch = fetchMock as unknown as typeof global.fetch

    try {
      const { MyDashboardClient } = await import('../MyDashboardClient')
      MyDashboardClient({ ...baseProps })
      await flushPromises()

      expect(fetchMock).toHaveBeenCalledWith('/api/participant/events', { cache: 'no-store' })
      expect(setParticipantEvents).toHaveBeenCalledWith(payload)
      expect(setParticipantEventsError).toHaveBeenCalledWith('')
      expect(setParticipantEventsLoading).toHaveBeenCalledWith(false)
    } finally {
      global.fetch = originalFetch
    }
  })

  test('records the shared fetch failure so WellnessDirectorCard can fall back to name-only', async () => {
    const setPulseDoneBanner = jest.fn()
    const setParticipantEvents = jest.fn()
    const setParticipantEventsLoading = jest.fn()
    const setParticipantEventsError = jest.fn()

    mockUseState
      .mockReturnValueOnce([false, setPulseDoneBanner])
      .mockReturnValueOnce([null, setParticipantEvents])
      .mockReturnValueOnce([true, setParticipantEventsLoading])
      .mockReturnValueOnce(['', setParticipantEventsError])

    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: jest.fn().mockResolvedValue({ error: 'Request failed (500)' }),
    })
    const originalFetch = global.fetch
    global.fetch = fetchMock as unknown as typeof global.fetch

    try {
      const { MyDashboardClient } = await import('../MyDashboardClient')
      MyDashboardClient({ ...baseProps })
      await flushPromises()

      expect(setParticipantEvents).toHaveBeenCalledWith(null)
      expect(setParticipantEventsError).toHaveBeenCalledWith('Events card failed to load. Detail: Request failed (500)')
      expect(setParticipantEventsLoading).toHaveBeenCalledWith(false)
    } finally {
      global.fetch = originalFetch
    }
  })
})
