import { DashboardShell } from '@/components/layout/DashboardShell'
import { getTeamDashboard } from '@/lib/supabase/queries'
import { Card, Alert, Badge, ScorePill } from '@/components/ui'
import { recoveryColor, initials } from '@/lib/utils'
import { Info } from 'lucide-react'
import { TeamRosterClient } from './TeamRosterClient'

export const revalidate = 60

export default async function TeamPage() {
  const { employees } = await getTeamDashboard()
  return (
    <DashboardShell title="Team Roster">
      <Alert variant="info" icon={<Info size={14} />}>
        Travis Brandenburgh's row shows{' '}
        <strong style={{ color: '#fff' }}>exact WHOOP data — June 9 2026.</strong>{' '}
        All other employees show generated data modeled on similar ranges. Click any row to view full biometric detail.
      </Alert>
      <TeamRosterClient employees={employees} />
    </DashboardShell>
  )
}
