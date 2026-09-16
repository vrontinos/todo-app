import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bulkActionSafetyPatch } from '../scripts/bulk-action-safety-patch.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const rawApp = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8')
const transformed = bulkActionSafetyPatch().transform(rawApp, path.join(root, 'src', 'App.jsx'))?.code

assert.equal(typeof transformed, 'string', 'bulk safety transform must produce App.jsx code')

function count(haystack, needle) {
  return haystack.split(needle).length - 1
}

test('bulk task delete stays a single database delete request', () => {
  assert.match(transformed, /\.from\('tasks'\)[\s\S]{0,400}\.delete\(\)[\s\S]{0,400}\.in\('id', idsToDelete\)/)
})

test('realtime task DELETE applies local reducer instead of full refetch storm', () => {
  assert.match(transformed, /if \(payload\?\.eventType === 'DELETE'\) \{\s*applyTaskRealtimePayload\(payload\)/)
  assert.doesNotMatch(
    transformed,
    /if \(payload\?\.eventType === 'DELETE'\) \{[\s\S]{0,900}fetchAllTasks\(false\)[\s\S]{0,900}fetchTasks\(/,
  )
})

test('note DELETE refresh is scoped to the currently active task', () => {
  assert.match(
    transformed,
    /eventType === 'DELETE'[\s\S]{0,300}String\(currentActiveTask\.id\) === String\(changedTaskId\)[\s\S]{0,300}!isEditingNote/,
  )
})

test('bulk task moves are set-based and rollback both task collections on failure', () => {
  assert.ok(count(transformed, ".in('id', taskIds)") >= 1)
  assert.ok(count(transformed, ".in('id', idsToMove)") >= 1)
  assert.match(transformed, /setTasks\(oldTasks\)[\s\S]{0,160}setAllTasks\(oldAllTasks\)/)
})

test('note counters remain derived from task_notes rows', () => {
  assert.match(transformed, /from\('task_notes'\)\.select\('task_id'\)/)
  assert.match(transformed, /counts\[note\.task_id\] = \(counts\[note\.task_id\] \|\| 0\) \+ 1/)
  assert.match(transformed, /setNoteCountsByTask\(counts\)/)
})

test('list counters remain derived independently for completed and incomplete tasks', () => {
  assert.match(transformed, /const incompleteCountByList = useMemo\(\(\) => \{[\s\S]{0,500}!task\.completed/)
  assert.match(transformed, /const completedCountByList = useMemo\(\(\) => \{[\s\S]{0,500}task\.completed/)
})

test('offline recovery still refreshes lists and all tasks', () => {
  assert.match(
    transformed,
    /function handleOnline\(\) \{[\s\S]{0,500}setIsOffline\(false\)[\s\S]{0,500}fetchLists\(false\)[\s\S]{0,500}fetchAllTasks\(false\)/,
  )
})

test('realtime ownership remains single-owner with expiry and channel cleanup', () => {
  assert.match(transformed, /const leaseKey = `live-sync-owner-\$\{userId\}`/)
  assert.match(transformed, /const leaseMs = 15000/)
  assert.match(transformed, /function canOwnRealtime\(\)[\s\S]{0,300}Number\(lease\.expiresAt\) < Date\.now\(\)/)
  assert.match(transformed, /supabase\.removeChannel\(oldChannel\)/)
})

test('hidden or offline documents do not retain a realtime channel', () => {
  assert.match(
    transformed,
    /if \(isOffline \|\| document\.visibilityState !== 'visible'\) \{\s*stopRealtime\(\)\s*return\s*\}/,
  )
})

test('desktop updater check remains delayed rather than blocking startup', () => {
  assert.match(transformed, /setTimeout\(\(\) => \{\s*checkForUpdates\(\)\s*\}, 3000\)/)
})

test('mobile destructive interactions keep offline/search guards', () => {
  assert.match(transformed, /const swipeEnabled = isTouchInput && !isSearchMode && !isOffline/)
  assert.match(transformed, /if \(!isTouchInput \|\| isOffline \|\| isSearchMode\) return/)
})

test('safety transform is fail-closed if its expected source contract drifts', () => {
  const plugin = bulkActionSafetyPatch()
  assert.throws(
    () => plugin.transform('export default function App() { return null }', '/tmp/src/App.jsx'),
    /Expected block not found/,
  )
})
