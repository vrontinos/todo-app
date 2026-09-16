import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')
const appSource = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8')

function functionBlock(name, nextName) {
  const start = appSource.indexOf(`function ${name}(`)
  const end = appSource.indexOf(`function ${nextName}(`, start)
  assert.ok(start >= 0, `${name} must exist`)
  assert.ok(end > start, `${nextName} must follow ${name}`)
  return appSource.slice(start, end)
}

test('list reorder remains optimistic before persistence', () => {
  assert.match(
    appSource,
    /setLists\(reorderedLists\)[\s\S]{0,220}await saveListPositions\(reorderedLists\)/,
  )
})

test('list reorder persistence remains offline-safe and restores server state after partial failure', () => {
  const source = functionBlock('saveListPositions', 'saveTaskPositions')
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

test('task reorder persistence preserves mutation metadata and recovers after partial failure', () => {
  const source = functionBlock('saveTaskPositions', 'handleMoveTaskByDrag')
  assert.match(source, /if \(isOffline\) return/)
  assert.match(source, /suppressOwnTaskRealtimeUntilRef\.current = Date\.now\(\) \+ 1500/)
  assert.match(source, /Promise\.all\([\s\S]{0,700}from\('tasks'\)[\s\S]{0,240}position: index \+ 1/)
  assert.match(source, /updated_at: now/)
  assert.match(source, /updated_by: session\?\.user\?\.id \|\| null/)
  assert.match(source, /results\.some\(\(result\) => result\.error\)/)
  assert.match(source, /suppressOwnTaskRealtimeUntilRef\.current = 0[\s\S]{0,220}fetchTasks\(selectedList\?\.id, false\)/)
  assert.match(source, /markSynced\(\)/)
})
