import { DashboardShell } from '@/components/layout/DashboardShell'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { InterventionDetailClient } from './InterventionDetailClient'
import { notFound } from 'next/navigation'

export const revalidate = 60

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

  const { data: employee } = await supabase
    .from('employees')
    .select('*')
    .eq('id', intervention.employee_id)
    .single()

  const { data: wellness } = await supabase
    .from('daily_wellness')
    .select('*')
    .eq('employee_id', intervention.employee_id)
    .gte('date', intervention.date_triggered ?? '2026-01-01')
    .order('date', { ascending: true })

  const { data: habits } = await supabase
    .from('habits')
    .select('*')
    .eq('employee_id', intervention.employee_id)
    .gte('date', intervention.date_triggered ?? '2026-01-01')
    .order('date', { ascending: false })
    .limit(7)

  const { data: workouts } = await supabase
    .from('workouts')
    .select('*')
    .eq('employee_id', intervention.employee_id)
    .gte('date', intervention.date_triggered ?? '2026-01-01')
    .order('date', { ascending: false })
    .limit(7)

  return (
    <DashboardShell title="Intervention Detail">
      <InterventionDetailClient
        intervention={intervention}
        employee={employee}
        wellness={wellness ?? []}
        habits={habits ?? []}
        workouts={workouts ?? []}
      />
    </DashboardShell>
  )
}
