/**
 * Nudge response reporting local test-data generator.
 * Run: npm run db:seed:nudge-responses [count]
 * (after `npm run db:seed`, which publishes the weekly nudge these
 * acknowledgements attach to)
 *
 * The admin/wellness-director "Responses" tab (src/app/admin/events/AdminEventsClient.tsx,
 * backed by src/app/api/admin/events/route.ts) only ever had 10 real seeded
 * participants to acknowledge a nudge, which was never enough to exercise the
 * reporting UI's most-recent-50 cap or its "showing most recent 50" note. This
 * script backfills additional synthetic participants (if needed) and creates
 * `count` nudge_acknowledgements rows (default: a random number between 10 and
 * 50) against the most recently published weekly nudge, with acknowledged_at
 * timestamps spread over the past few days so ordering/pagination looks
 * realistic.
 *
 * Pass an explicit count greater than 50 (e.g. `npm run db:seed:nudge-responses -- 60`)
 * to go over the cap and verify the UI truncates to the 50 most recent
 * responses and shows the "Showing the most recent 50 of N responses" note.
 *
 * Encryption of response_text_encrypted is done via the `seed_nudge_acknowledgement`
 * SQL RPC (supabase/migrations/20260903190000_seed_nudge_acknowledgement_helper.sql),
 * which is service_role-only and mirrors the participant-facing
 * upsert_nudge_acknowledgement RPC's encryption logic without its auth checks.
 *
 * Safe to re-run: acknowledgements are upserted keyed on (nudge_id, participant_id),
 * and synthetic participants are upserted keyed on id.
 */

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const encryptionKey = process.env.NUDGE_RESPONSE_ENCRYPTION_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.')
}
if (!encryptionKey) {
  throw new Error('Missing NUDGE_RESPONSE_ENCRYPTION_KEY in environment.')
}

function isLocalSupabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
  } catch {
    return false
  }
}

function assertSeedingAllowed(url: string) {
  const voiloopEnv = (process.env.VOILOOP_ENV ?? '').toLowerCase()
  const allowNonLocalSeed = process.env.VOILOOP_ALLOW_NON_LOCAL_SEED === 'true'

  if (voiloopEnv === 'pilot' || voiloopEnv === 'production') {
    throw new Error(`Refusing to seed when VOILOOP_ENV=${voiloopEnv}. Seeding is local-only by default.`)
  }
  if (isLocalSupabaseUrl(url)) return
  if (allowNonLocalSeed) {
    console.warn('⚠ VOILOOP_ALLOW_NON_LOCAL_SEED=true set. Proceeding to seed non-local Supabase environment.')
    return
  }
  throw new Error(
    `Refusing to seed non-local Supabase URL (${url}). ` +
    'Set VOILOOP_ALLOW_NON_LOCAL_SEED=true only when you explicitly intend to seed a remote environment.'
  )
}

assertSeedingAllowed(supabaseUrl)

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const SAMPLE_RESPONSES = [
  'Feeling good this week, kept up with my movement goals.',
  'A bit tired but pushed through a short walk today.',
  'Great recovery — slept well and hit the gym twice.',
  'Stressful week at work, only managed light stretching.',
  'Consistent habits are paying off, energy is up.',
  'Struggled with sleep but stayed hydrated and active.',
  'Team workout was a highlight this week!',
  'Recovering from a minor injury, taking it easy.',
  'Back on track after a slow start to the week.',
  'Really appreciated the reminder, needed the motivation.',
]

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

async function getOrCreateSyntheticParticipants(count: number): Promise<string[]> {
  const { data: activeParticipants, error } = await supabase
    .from('participants')
    .select('id')
    .eq('status', 'Active')
  if (error) { console.error('Participant lookup:', error); process.exit(1) }

  const existingIds = (activeParticipants ?? []).map((p) => p.id as string)
  if (existingIds.length >= count) {
    return existingIds.slice(0, count)
  }

  const needed = count - existingIds.length
  const syntheticDefs = Array.from({ length: needed }, (_, i) => {
    const n = i + 1
    const id = `NUDGESEED${String(n).padStart(3, '0')}`
    return {
      id,
      first_name: `Seed`,
      last_name: `Responder${n}`,
      department: 'Seed Data',
      title: 'Synthetic Participant',
      device_id: `SEED-${String(n).padStart(3, '0')}`,
      cohort: 'seed-nudge-responses',
      enrolled_date: '2026-01-01',
      is_exact_data: false,
      consent: true,
      status: 'Active',
    }
  })

  const { error: upsertErr } = await supabase
    .from('participants')
    .upsert(syntheticDefs, { onConflict: 'id' })
  if (upsertErr) { console.error('Synthetic participants:', upsertErr); process.exit(1) }
  console.log(`✅ Ensured ${needed} synthetic participant(s) for nudge response seeding`)

  return [...existingIds, ...syntheticDefs.map((p) => p.id)]
}

async function seedNudgeResponses() {
  const requestedCount = Number(process.argv[2])
  const count = Number.isFinite(requestedCount) && requestedCount > 0
    ? Math.floor(requestedCount)
    : randomInt(10, 50)

  console.log(`🌱 Seeding ${count} nudge acknowledgement(s)...`)

  const { data: recentNudge, error: nudgeError } = await supabase
    .from('weekly_nudges')
    .select('id, week_of')
    .order('week_of', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (nudgeError) { console.error('Weekly nudge lookup:', nudgeError); process.exit(1) }
  if (!recentNudge) {
    throw new Error('No weekly_nudges row found. Run `npm run db:seed` first to publish a nudge.')
  }

  const { data: existingTarget, error: targetError } = await supabase
    .from('nudge_targets')
    .select('id')
    .eq('nudge_id', recentNudge.id)
    .eq('target_type', 'all')
    .maybeSingle()
  if (targetError) { console.error('Nudge target lookup:', targetError); process.exit(1) }
  if (!existingTarget) {
    const { error: insertTargetErr } = await supabase
      .from('nudge_targets')
      .insert({ nudge_id: recentNudge.id, target_type: 'all', target_label: '', participant_id: null })
    if (insertTargetErr) { console.error('Nudge target insert:', insertTargetErr); process.exit(1) }
  }

  const participantIds = await getOrCreateSyntheticParticipants(count)
  const now = Date.now()

  for (let i = 0; i < count; i++) {
    const participantId = participantIds[i]
    const responseText = SAMPLE_RESPONSES[i % SAMPLE_RESPONSES.length]
    // Spread acknowledgements over the past week, newest first as i increases,
    // so the "most recent 50" ordering has realistic variety to display/verify.
    const acknowledgedAt = new Date(now - (count - i) * 45 * 60 * 1000).toISOString()

    const { data, error } = await supabase.rpc('seed_nudge_acknowledgement', {
      p_nudge_id: recentNudge.id,
      p_participant_id: participantId,
      p_response_text: responseText,
      p_encryption_key: encryptionKey,
      p_acknowledged_at: acknowledgedAt,
    })
    if (error) { console.error(`Seed acknowledgement for ${participantId}:`, error); process.exit(1) }
    if (data?.error) { console.error(`Seed acknowledgement for ${participantId}:`, data.error); process.exit(1) }
  }

  console.log(`✅ Seeded ${count} nudge acknowledgement(s) for nudge "${recentNudge.week_of}" (id: ${recentNudge.id})`)
  if (count > 50) {
    console.log('   → count exceeds the reporting UI\'s cap of 50; the Responses tab should show the "most recent 50" note.')
  } else {
    console.log('   → count is within the cap of 50; pass a count > 50 (e.g. `npm run db:seed:nudge-responses -- 60`) to test truncation.')
  }
}

seedNudgeResponses()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Nudge response seeding failed:', err)
    process.exit(1)
  })
