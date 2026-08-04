import fs from 'fs'
import path from 'path'

describe('upload batches participant-history migration', () => {
  const migrationPath = path.resolve(
    process.cwd(),
    'supabase',
    'migrations',
    '20260804000500_upload_batches_participant_history.sql',
  )

  test('backfills only uniquely attributable historical batches', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('having count(distinct participant_id) = 1')
    expect(sql).toContain('and ub.participant_id is null;')
    expect(sql).toContain('from attributable_batches as ab')
  })

  test('keeps uploader and leadership reads while adding participant-owned reads', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('participant_id in (')
    expect(sql).toContain('where p.auth_user_id = auth.uid()')
    expect(sql).toContain('or imported_by = auth.uid()')
    expect(sql).toContain("or public.current_app_role() in ('admin', 'wellness_director')")
  })
})
