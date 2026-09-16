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
  '20260916142500_add_atomic_task_reorder_rpc.sql',
)
const sql = fs.readFileSync(migrationPath, 'utf8')

test('atomic task reorder RPC remains invoker-safe and authenticated-only', () => {
  assert.match(sql, /create or replace function public\.reorder_tasks_atomic\(/i)
  assert.match(sql, /security invoker/i)
  assert.doesNotMatch(sql, /security definer/i)
  assert.match(sql, /set search_path = pg_catalog, public/i)
  assert.match(sql, /v_user_id uuid := auth\.uid\(\)/i)
  assert.match(sql, /lm\.role in \('owner', 'editor'\)/i)
  assert.match(sql, /revoke all on function public\.reorder_tasks_atomic\(bigint, bigint\[\]\) from public/i)
  assert.match(sql, /grant execute on function public\.reorder_tasks_atomic\(bigint, bigint\[\]\) to authenticated/i)
})

test('atomic task reorder RPC requires the complete exact task set', () => {
  assert.match(sql, /count\(distinct u\.task_id\)/i)
  assert.match(sql, /v_input_count <> v_distinct_count/i)
  assert.match(sql, /v_input_count <> v_expected_count/i)
  assert.match(sql, /t\.id = any\(p_task_ids\)/i)
  assert.match(sql, /v_matched_count <> v_expected_count/i)
  assert.match(sql, /get diagnostics v_updated_count = row_count/i)
  assert.match(sql, /v_updated_count <> v_expected_count/i)
})

test('atomic task reorder RPC normalizes positions and preserves mutation metadata', () => {
  assert.match(sql, /ordinality::integer as new_position/i)
  assert.match(sql, /unnest\(p_task_ids\) with ordinality as u\(task_id, ordinality\)/i)
  assert.match(sql, /position = desired\.new_position/i)
  assert.match(sql, /updated_by = v_user_id/i)
})
