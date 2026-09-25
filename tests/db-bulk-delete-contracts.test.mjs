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
  '20260926001500_add_atomic_bulk_task_delete_rpc.sql',
)
const sql = fs.readFileSync(migrationPath, 'utf8')

test('atomic bulk delete RPC is security invoker and accepts bigint array input', () => {
  assert.match(sql, /function public\.delete_tasks_atomic\(p_task_ids bigint\[\]\)/i)
  assert.match(sql, /security invoker/i)
  assert.doesNotMatch(sql, /security definer/i)
  assert.match(sql, /set search_path = ''/i)
})

test('atomic bulk delete validates non-empty unique ids', () => {
  assert.match(sql, /cardinality\(p_task_ids\) = 0/i)
  assert.match(sql, /array_position\(p_task_ids, null\)/i)
  assert.match(sql, /count\(distinct requested\.id\)/i)
  assert.match(sql, /v_distinct_count <> v_requested_count/i)
})

test('atomic bulk delete is one set-based delete with exact row-count rollback guard', () => {
  assert.match(sql, /delete from public\.tasks as task[\s\S]*task\.id = any \(p_task_ids\)/i)
  assert.match(sql, /get diagnostics v_deleted_count = row_count/i)
  assert.match(sql, /v_deleted_count <> v_requested_count/i)
  assert.match(sql, /raise exception 'bulk task delete rejected:/i)
})

test('atomic bulk delete RPC is not callable by anon or PUBLIC', () => {
  assert.match(sql, /revoke all on function public\.delete_tasks_atomic\(bigint\[\]\) from public/i)
  assert.match(sql, /revoke execute on function public\.delete_tasks_atomic\(bigint\[\]\) from anon/i)
  assert.match(sql, /grant execute on function public\.delete_tasks_atomic\(bigint\[\]\) to authenticated/i)
})
