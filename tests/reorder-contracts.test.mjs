import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { atomicTaskReorderPatch } from '../scripts/atomic-task-reorder-patch.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')
const appPath = path.join(root, 'src', 'App.jsx')
const appSource = fs.readFileSync(appPath, 'utf8')
const viteConfigSource = fs.readFileSync(path.join(root, 'vite.config.js'), 'utf8')
const transformedApp = atomicTaskReorderPatch().transform(appSource, appPath)?.code

assert.equal(typeof transformedApp, 'string', 'atomic task reorder transform must produce App.jsx code')

function functionBlock(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`)
  const end = source.indexOf(`function ${nextName}(`, start)
  assert.ok(start >= 0, `${name} must exist`)
  assert.ok(end > start, `${nextName} must follow ${name}`)
  return source.slice(start, end)
}

test('list reorder remains optimistic before persistence', () => {
  assert.match(
    appSource,
    /setLists\(reorderedLists\)[\s\S]{0,220}await saveListPositions\(reorderedLists\)/,
  )
})

test('list reorder persistence remains offline-safe and restores server state after partial failure', () => {
  const source = functionBlock(appSource, 'saveListPositions', 'saveTaskPositions')
  assert.match(source, /if \(isOffline\) return/)
  assert.match(source, /Promise\.all\([\s\S]{0,500}from\('lists'\)[\s\S]{0,220}position: index \+ 1/)
  assert.match(source, /results\.some\(\(result\) => result\.error\)/)
  assert.match(source, /if \(hasError\) \{/)
  assert.match(source, /setSyncStatus\('error'\)/)
  assert.match(source, /fetchLists\(\)/)
  assert.match(source, /markSynced\(\)/)
})

test('task reorder remains optimistic before persistence', () => {
  assert.match(
    appSource,
    /setTasks\(sortTasks\(reorderedTasks, 'manual', currentSortDirection\)\)[\s\S]{0,1800}await saveTaskPositions\(reorderedTasks\)/,
  )
  assert.match(
    appSource,
    /setAllTasks\([\s\S]{0,700}position: updated\.position[\s\S]{0,500}await saveTaskPositions\(reorderedTasks\)/,
  )
})

test('task reorder persistence uses one atomic RPC and recovers after failure', () => {
  const source = functionBlock(transformedApp, 'saveTaskPositions', 'handleMoveTaskByDrag')
  assert.match(source, /if \(isOffline\) return/)
  assert.match(source, /suppressOwnTaskRealtimeUntilRef\.current = Date\.now\(\) \+ 1500/)
  assert.match(source, /supabase\.rpc\('reorder_tasks_atomic', \{/)
  assert.match(source, /p_list_id: selectedList\?\.id/)
  assert.match(source, /p_task_ids: updatedTasks\.map\(\(task\) => task\.id\)/)
  assert.doesNotMatch(source, /Promise\.all\(/)
  assert.doesNotMatch(source, /\.from\('tasks'\)/)
  assert.match(source, /if \(error\) \{/)
  assert.match(source, /suppressOwnTaskRealtimeUntilRef\.current = 0[\s\S]{0,220}fetchTasks\(selectedList\?\.id, false\)/)
  assert.match(source, /markSynced\(\)/)
})

test('atomic task reorder patch runs before the existing Vite safety patches', () => {
  assert.match(
    viteConfigSource,
    /import \{ atomicTaskReorderPatch \} from '\.\/scripts\/atomic-task-reorder-patch\.js'/,
  )
  assert.match(
    viteConfigSource,
    /atomicTaskReorderPatch\(\),\s*realtimeLeaseHandoffPatch\(\),\s*realtimeVisibilityRecoveryPatch\(\),\s*bulkActionSafetyPatch\(\),\s*authStorageSafetyPatch\(\),\s*react\(\)/,
  )
})

test('atomic task reorder patch fails closed if its expected source contract drifts', () => {
  const plugin = atomicTaskReorderPatch()
  assert.throws(
    () => plugin.transform('export default function App() { return null }', '/tmp/src/App.jsx'),
    /Expected block not found/,
  )
})
