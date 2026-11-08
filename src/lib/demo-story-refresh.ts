import { createAdminSupabaseClient } from './supabase/admin'
import { DEMO_STORY_PARTICIPANTS, generateDemoStory } from './demo-story'

export interface DemoStoryRefreshResult {
  anchor: string
  pulse_count: number
  recovery_count: number
}

export async function refreshDemoStory(): Promise<DemoStoryRefreshResult> {
  const admin = createAdminSupabaseClient()
  const { data: participants, error } = await admin.from('participants')
    .select('id, first_name, last_name, enrolled_date, is_exact_data, status')
    .in('id', DEMO_STORY_PARTICIPANTS.map(profile => profile.id))
  if (error) throw new Error(`Unable to verify demo participants: ${error.message}`)
  const profiles = DEMO_STORY_PARTICIPANTS.map(expected => {
    const actual = participants?.find(participant => participant.id === expected.id)
    if (!actual || actual.first_name !== expected.first_name || actual.last_name !== expected.last_name
      || actual.is_exact_data !== false || actual.status !== 'Active') {
      throw new Error(`Demo cohort mismatch at ${expected.id}. Run the approved demo seed setup before refreshing.`)
    }
    return { id: expected.id, first_name: expected.first_name, last_name: expected.last_name, enrolled_date: actual.enrolled_date }
  })
  const enrollmentDates = Object.fromEntries(profiles.map(profile => [profile.id, profile.enrolled_date]))
  const story = generateDemoStory(new Date().toISOString().slice(0, 10), enrollmentDates)
  const { data, error: refreshError } = await admin.rpc('refresh_demo_story', {
    p_anchor: story.anchor, p_profiles: profiles, p_recovery: story.recovery, p_pulse: story.pulse,
  })
  if (refreshError) throw new Error(`Demo refresh was not applied: ${refreshError.message}`)
  if (!data || data.anchor !== story.anchor || data.pulse_count !== story.pulse.length
    || data.recovery_count !== story.recovery.length) {
    throw new Error('Demo refresh returned an unexpected result. Check the database before retrying.')
  }
  return { anchor: data.anchor, pulse_count: data.pulse_count, recovery_count: data.recovery_count }
}
