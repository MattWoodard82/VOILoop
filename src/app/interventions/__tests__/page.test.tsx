import type { ReactNode } from 'react'
import InterventionsPage from '../page'
import { getInterventions, getParticipants } from '@/lib/supabase/queries'
import { requireAuth } from '@/lib/supabase/server'

jest.mock('@/components/layout/DashboardShell', () => ({
  DashboardShell: ({ title, children }: { title: string; children: ReactNode }) => (
    <div data-testid="dashboard-shell">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}))

jest.mock('@/components/ui', () => ({
  KpiCard: ({ label, value, delta }: { label: string; value: string | number; delta?: string }) => (
    <div>
      <span>{label}</span>
      <span>{value}</span>
      {delta ? <span>{delta}</span> : null}
    </div>
  ),
  Card: ({ title, children }: { title: string; children: ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}))

jest.mock('@/lib/supabase/queries', () => ({
  getInterventions: jest.fn(),
  getParticipants: jest.fn(),
}))

jest.mock('@/lib/supabase/server', () => ({
  requireAuth: jest.fn(),
}))

jest.mock('../InterventionCreateClient', () => ({
  InterventionCreateClient: () => <div>create-client</div>,
}))

jest.mock('../InterventionsTableClient', () => ({
  InterventionsTableClient: () => <div>table-client</div>,
}))

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}))

describe('InterventionsPage', () => {
  const mockGetInterventions = getInterventions as jest.MockedFunction<typeof getInterventions>
  const mockGetParticipants = getParticipants as jest.MockedFunction<typeof getParticipants>
  const mockRequireAuth = requireAuth as jest.MockedFunction<typeof requireAuth>

  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ role: 'wellness_director', mustChangePassword: false } as never)
    mockGetParticipants.mockResolvedValue([
      {
        id: 'EMP001',
        first_name: 'Alex',
        last_name: 'Morgan',
        department: 'ICU',
      },
    ] as never)
    mockGetInterventions.mockResolvedValue([
      {
        id: 'int-1',
        participant_id: 'EMP001',
        trigger_metric: 'Recovery Score',
        trigger_value: '38',
        intervention_type: '1:1 Wellness Check-in',
        assigned_to: 'Wellness Director',
        date_triggered: '2026-08-18',
        outcome: 'Pending',
        department: 'ICU',
        notes: 'Needs review',
      },
    ] as never)
  })

  test('renders manual logging copy and coming-soon recommendation card', async () => {
    const page = await InterventionsPage()
    expect(page).toMatchSnapshot()
  })
})
