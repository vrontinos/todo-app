import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')
const migrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260925102607_add_task_note_counts_rpc.sql',
)
const sql = fs.readFileSync(migrationPath, 'utf8')

test('task note count RPC remains invoker-safe and authenticated-only', () => {
  assert.match(sql, /create or replace function public\.get_task_note_counts\(\)/i)
  assert.match(sql, /security invoker/i)
  assert.doesNotMatch(sql, /security definer/i)
  assert.match(sql, /set search_path = ''/i)
  assert.match(sql, /revoke all on function public\.get_task_note_counts\(\) from public/i)
  assert.match(sql, /revoke execute on function public\.get_task_note_counts\(\) from anon/i)
  assert.match(sql, /grant execute on function public\.get_task_note_counts\(\) to authenticated/i)
})

test('task note count RPC aggregates visible task_notes rows server-side', () => {
  assert.match(
    sql,
    /returns table\s*\(\s*task_id bigint,\s*note_count bigint\s*\)/i,
  )
  assert.match(sql, /from public\.task_notes as tn/i)
  assert.match(sql, /count\(\*\)::bigint as note_count/i)
  assert.match(sql, /group by tn\.task_id/i)
})
