import { DashboardShell } from '@/components/layout/DashboardShell'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { InterventionDetailClient } from './InterventionDetailClient'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function InterventionDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = createServerSupabaseClient()

  const { data: intervention } = await supabase
    .from('interventions')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!intervention) notFound()

  const { data: participant } = await supabase
    .from('participants')
    .select('*')
    .eq('id', intervention.participant_id)
    .single()

  const { data: wellness } = await supabase
    .from('daily_wellness')
    .select('*')
    .eq('participant_id', intervention.participant_id)
    .gte('date', intervention.date_triggered ?? '2026-01-01')
    .order('date', { ascending: true })

  const { data: habits } = await supabase
    .from('habits')
    .select('*')
    .eq('participant_id', intervention.participant_id)
    .gte('date', intervention.date_triggered ?? '2026-01-01')
    .order('date', { ascending: false })
    .limit(7)

  const { data: workouts } = await supabase
    .from('workouts')
    .select('*')
    .eq('participant_id', intervention.participant_id)
    .gte('date', intervention.date_triggered ?? '2026-01-01')
    .order('date', { ascending: false })
    .limit(7)

  return (
    <DashboardShell title="Intervention Detail">
      <InterventionDetailClient
        intervention={intervention}
        participant={participant}
        wellness={wellness ?? []}
        habits={habits ?? []}
        workouts={workouts ?? []}
      />
    </DashboardShell>
  )
}
