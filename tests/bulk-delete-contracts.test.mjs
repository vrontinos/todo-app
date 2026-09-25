import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { atomicBulkDeletePatch } from '../scripts/atomic-bulk-delete-patch.js'
import { bulkActionSafetyPatch } from '../scripts/bulk-action-safety-patch.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')
const appPath = path.join(root, 'src', 'App.jsx')
const rawApp = fs.readFileSync(appPath, 'utf8')
const viteConfig = fs.readFileSync(path.join(root, 'vite.config.js'), 'utf8')

const atomicTransformed = atomicBulkDeletePatch().transform(rawApp, appPath)?.code
assert.equal(typeof atomicTransformed, 'string', 'atomic bulk delete transform must produce App.jsx code')

const transformed = bulkActionSafetyPatch().transform(atomicTransformed, appPath)?.code
assert.equal(typeof transformed, 'string', 'bulk safety transform must remain compatible after atomic delete patch')

test('bulk task delete uses RPC body instead of thousands of ids in a REST query string', () => {
  assert.match(
    transformed,
    /supabase\.rpc\('delete_tasks_atomic',\s*\{\s*p_task_ids:\s*idsToDelete,?\s*\}\)/,
  )
  assert.doesNotMatch(
    transformed,
    /\.from\('tasks'\)\s*\.delete\(\)\s*\.in\('id', idsToDelete\)/,
  )
})

test('bulk task delete snapshots and restores both task collections on failure', () => {
  assert.match(
    transformed,
    /const oldTasks = \[\.\.\.tasks\]\s*const oldAllTasks = \[\.\.\.allTasks\]\s*const idsToDelete = \[\.\.\.selectedTasks\]/,
  )
  assert.match(
    transformed,
    /console\.error\('Σφάλμα διαγραφής:', error\)[\s\S]{0,500}setTasks\(oldTasks\)[\s\S]{0,160}setAllTasks\(oldAllTasks\)/,
  )
})

test('atomic bulk delete patch is wired into Vite before the existing safety chain', () => {
  assert.match(
    viteConfig,
    /atomicBulkDeletePatch\(\),\s*listReorderOwnerGuardPatch\(\),\s*atomicListReorderPatch\(\),\s*atomicTaskReorderPatch\(\),/,
  )
})

test('atomic bulk delete transform fails closed if the source contract drifts', () => {
  const plugin = atomicBulkDeletePatch()
  assert.throws(
    () => plugin.transform('export default function App() { return null }', '/tmp/src/App.jsx'),
    /Expected block not found/,
  )
})
