import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { atomicTaskReorderPatch } from '../scripts/atomic-task-reorder-patch.js'
import { atomicListReorderPatch } from '../scripts/atomic-list-reorder-patch.js'
import { listReorderOwnerGuardPatch } from '../scripts/list-reorder-owner-guard-patch.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')
const appPath = path.join(root, 'src', 'App.jsx')
const appSource = fs.readFileSync(appPath, 'utf8')
const viteConfigSource = fs.readFileSync(path.join(root, 'vite.config.js'), 'utf8')
const ownerGuardedApp = listReorderOwnerGuardPatch().transform(appSource, appPath)?.code
const atomicListApp = atomicListReorderPatch().transform(ownerGuardedApp, appPath)?.code
const transformedApp = atomicTaskReorderPatch().transform(atomicListApp, appPath)?.code

assert.equal(typeof ownerGuardedApp, 'string', 'list reorder owner guard transform must produce App.jsx code')
assert.equal(typeof atomicListApp, 'string', 'atomic list reorder transform must produce App.jsx code')
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

test('list reorder persistence uses one atomic RPC and restores server state after failure', () => {
  const source = functionBlock(atomicListApp, 'saveListPositions', 'saveTaskPositions')
  assert.match(source, /if \(isOffline \|\| !canReorderVisibleLists\(\)\) return/)
  assert.match(source, /supabase\.rpc\('reorder_lists_atomic', \{/)
  assert.match(source, /p_list_ids: updatedLists\.map\(\(list\) => list\.id\)/)
  assert.doesNotMatch(source, /Promise\.all\(/)
  assert.doesNotMatch(source, /\.from\('lists'\)/)
  assert.match(source, /if \(error\) \{/)
  assert.match(source, /setSyncStatus\('error'\)/)
  assert.match(source, /fetchLists\(\)/)
  assert.match(source, /markSynced\(\)/)
})

test('list reorder is disabled unless every visible list belongs to the current user', () => {
  assert.match(
    ownerGuardedApp,
    /function canReorderVisibleLists\(\) \{[\s\S]{0,180}lists\.length > 0[\s\S]{0,180}lists\.every\(\(list\) => list\.owner_user_id === session\?\.user\?\.id\)/,
  )
  assert.match(
    ownerGuardedApp,
    /useSortable\(\{ id: getListDndId\(list\.id\), disabled: !canReorder \}\)/,
  )
  assert.match(
    ownerGuardedApp,
    /<SortableListItem[\s\S]{0,120}canReorder=\{canReorderVisibleLists\(\)\}/,
  )
})

test('list reorder persistence and drag handlers fail closed when shared lists are visible', () => {
  const saveSource = functionBlock(ownerGuardedApp, 'saveListPositions', 'saveTaskPositions')
  const dragStartSource = functionBlock(ownerGuardedApp, 'handleListDragStart', 'handleTaskDragStart')
  const globalDragSource = functionBlock(ownerGuardedApp, 'handleGlobalDragEnd', 'handleMoveTaskByDrag')

  assert.match(saveSource, /if \(isOffline \|\| !canReorderVisibleLists\(\)\) return/)
  assert.match(dragStartSource, /if \(!canReorderVisibleLists\(\)\) return/)
  assert.match(
    globalDragSource,
    /if \(activeMeta\.type === 'list' && overMeta\.type === 'list'\) \{\s*if \(!canReorderVisibleLists\(\)\) return/,
  )
})

test('task drops onto shared lists remain available before the list owner guard', () => {
  const listDropSource = functionBlock(ownerGuardedApp, 'handleListDrop', 'handleGlobalDragEnd')
  const taskMoveIndex = listDropSource.indexOf('await handleMoveDraggedTasksToList(draggedTaskIds, targetListId)')
  const ownerGuardIndex = listDropSource.indexOf('if (!canReorderVisibleLists())')

  assert.ok(taskMoveIndex >= 0, 'list drop must still move dragged tasks to a target list')
  assert.ok(ownerGuardIndex > taskMoveIndex, 'owner guard must run only after the task-drop path')
  assert.match(
    ownerGuardedApp,
    /<TaskListDropZone[\s\S]{0,180}disabled=\{isOffline\}/,
  )
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

test('reorder safety patches run before the existing Vite safety patches', () => {
  assert.match(
    viteConfigSource,
    /import \{ listReorderOwnerGuardPatch \} from '\.\/scripts\/list-reorder-owner-guard-patch\.js'/,
  )
  assert.match(
    viteConfigSource,
    /import \{ atomicListReorderPatch \} from '\.\/scripts\/atomic-list-reorder-patch\.js'/,
  )
  assert.match(
    viteConfigSource,
    /import \{ atomicTaskReorderPatch \} from '\.\/scripts\/atomic-task-reorder-patch\.js'/,
  )
  assert.match(
    viteConfigSource,
    /listReorderOwnerGuardPatch\(\),\s*atomicListReorderPatch\(\),\s*atomicTaskReorderPatch\(\),\s*realtimeLeaseHandoffPatch\(\),\s*realtimeVisibilityRecoveryPatch\(\),\s*bulkActionSafetyPatch\(\),\s*authStorageSafetyPatch\(\),\s*react\(\)/,
  )
})

test('list reorder owner guard patch fails closed if its expected source contract drifts', () => {
  const plugin = listReorderOwnerGuardPatch()
  assert.throws(
    () => plugin.transform('export default function App() { return null }', '/tmp/src/App.jsx'),
    /Expected block not found/,
  )
})

test('atomic list reorder patch fails closed if its expected source contract drifts', () => {
  const plugin = atomicListReorderPatch()
  assert.throws(
    () => plugin.transform('export default function App() { return null }', '/tmp/src/App.jsx'),
    /Expected block not found/,
  )
})

test('atomic task reorder patch fails closed if its expected source contract drifts', () => {
  const plugin = atomicTaskReorderPatch()
  assert.throws(
    () => plugin.transform('export default function App() { return null }', '/tmp/src/App.jsx'),
    /Expected block not found/,
  )
})
