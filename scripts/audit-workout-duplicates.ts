import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { auditTimezoneShiftedWorkouts, type AuditWorkout } from '../src/lib/whoop/workout-integrity'

dotenv.config({ path: '.env.local', quiet: true })

async function main() {
  const participantId = process.argv[2]?.trim()
  if (!participantId || participantId.startsWith('--') || process.argv.length !== 3) {
    throw new Error('Usage: npm run admin:audit-workout-duplicates -- <participant ID>')
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase URL and server-only service role key are required.')
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const rows: AuditWorkout[] = []
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from('workouts')
      .select('id,participant_id,date,start_time,end_time,activity,duration_min,strain,calories,max_hr,avg_hr,zone1_pct,zone2_pct,zone3_pct,zone4_pct,zone5_pct,source_batch_id')
      .eq('participant_id', participantId)
      .order('id')
      .range(offset, offset + pageSize - 1)
    if (error) throw new Error(`Cannot read workout audit fields: ${error.message}`)
    rows.push(...(data ?? []))
    if ((data ?? []).length < pageSize) break
  }
  const pairs = auditTimezoneShiftedWorkouts(rows)
  const batchIds = Array.from(new Set(pairs.flatMap((pair) => pair.batchIds).filter((id): id is string => id !== null)))
  const batches: Array<{ id: string; started_at: string; completed_at: string | null }> = []
  for (let offset = 0; offset < batchIds.length; offset += 100) {
    const { data, error } = await supabase.from('upload_batches')
      .select('id,started_at,completed_at')
      .in('id', batchIds.slice(offset, offset + 100))
    if (error) throw new Error(`Cannot read import batch audit fields: ${error.message}`)
    batches.push(...(data ?? []))
  }
  console.log(JSON.stringify({
    readOnly: true,
    workoutsScanned: rows.length,
    suspectPairs: pairs,
    batches,
    warning: 'Candidates only, not confirmed duplicates. Review batch provenance and compare against WHOOP where available before approving any repair. No data was changed.',
  }, null, 2))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
