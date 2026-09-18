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
const anonRevokeMigrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260918054149_revoke_anon_from_atomic_task_reorder_rpc.sql',
)
const listMigrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260918122500_add_atomic_list_reorder_rpc.sql',
)
const sql = fs.readFileSync(migrationPath, 'utf8')
const anonRevokeSql = fs.readFileSync(anonRevokeMigrationPath, 'utf8')
const listSql = fs.readFileSync(listMigrationPath, 'utf8')

test('atomic task reorder RPC remains invoker-safe and authenticated-only', () => {
  assert.match(sql, /create or replace function public\.reorder_tasks_atomic\(/i)
  assert.match(sql, /security invoker/i)
  assert.doesNotMatch(sql, /security definer/i)
  assert.match(sql, /set search_path = pg_catalog, public/i)
  assert.match(sql, /v_user_id uuid := auth\.uid\(\)/i)
  assert.match(sql, /lm\.role in \('owner', 'editor'\)/i)
  assert.match(sql, /revoke all on function public\.reorder_tasks_atomic\(bigint, bigint\[\]\) from public/i)
  assert.match(sql, /grant execute on function public\.reorder_tasks_atomic\(bigint, bigint\[\]\) to authenticated/i)
  assert.match(anonRevokeSql, /revoke execute on function public\.reorder_tasks_atomic\(bigint, bigint\[\]\) from anon/i)
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

test('atomic list reorder RPC remains invoker-safe, owner-only, and authenticated-only', () => {
  assert.match(listSql, /create or replace function public\.reorder_lists_atomic\(/i)
  assert.match(listSql, /security invoker/i)
  assert.doesNotMatch(listSql, /security definer/i)
  assert.match(listSql, /set search_path = pg_catalog, public/i)
  assert.match(listSql, /v_user_id uuid := auth\.uid\(\)/i)
  assert.match(listSql, /l\.owner_user_id = v_user_id/i)
  assert.doesNotMatch(listSql, /list_members|editor/i)
  assert.match(listSql, /revoke all on function public\.reorder_lists_atomic\(bigint\[\]\) from public/i)
  assert.match(listSql, /revoke execute on function public\.reorder_lists_atomic\(bigint\[\]\) from anon/i)
  assert.match(listSql, /grant execute on function public\.reorder_lists_atomic\(bigint\[\]\) to authenticated/i)
})

test('atomic list reorder RPC requires the complete exact owned list set', () => {
  assert.match(listSql, /for update/i)
  assert.match(listSql, /count\(distinct u\.list_id\)/i)
  assert.match(listSql, /v_input_count <> v_distinct_count/i)
  assert.match(listSql, /v_input_count <> v_expected_count/i)
  assert.match(listSql, /l\.id = any\(p_list_ids\)/i)
  assert.match(listSql, /v_matched_count <> v_expected_count/i)
  assert.match(listSql, /get diagnostics v_updated_count = row_count/i)
  assert.match(listSql, /v_updated_count <> v_expected_count/i)
  assert.match(listSql, /v_final_count <> v_expected_count/i)
})

test('atomic list reorder RPC normalizes owned list positions to contiguous ordinality', () => {
  assert.match(listSql, /ordinality::integer as new_position/i)
  assert.match(listSql, /unnest\(p_list_ids\) with ordinality as u\(list_id, ordinality\)/i)
  assert.match(listSql, /update public\.lists l/i)
  assert.match(listSql, /position = desired\.new_position/i)
  assert.match(listSql, /l\.owner_user_id = v_user_id/i)
})
