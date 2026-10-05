import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { mergeNoteSnapshot, mergeTaskSnapshot, upsertTaskRows } from '../src/realtimeSnapshot.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const app = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8')

test('primary-key-only note deletions clear badges without a page refresh', async () => {
  const handler = app.slice(app.indexOf('  async function handleNoteChange(payload)'), app.indexOf('  async function handleListChange()'))
  const countsFetcher = 'async function fetchTaskNoteCounts(' + app.split('async function fetchTaskNoteCounts(')[1].split('  async function fetchTasks(')[0]
  const scheduled = new Map()
  let counts = { 5: 2, 6: 1 }
  let reads = 0
  const context = vm.createContext({
    activeTaskRef: { current: null },
    editingNoteIdRef: { current: null },
    noteChangesForFetchRef: { current: null },
    latestTaskNoteCountsFetchIdRef: { current: 0 },
    session: { user: { id: 'viewer' } },
    isOwnRecentNoteMutation: () => false,
    setNoteCountsByTask: (value) => { counts = typeof value === 'function' ? value(counts) : value },
    scheduleRealtimeRefresh: (key, callback) => scheduled.set(key, callback),
    supabase: { rpc: async () => {
      reads += 1
      return { data: [{ task_id: 6, note_count: 1 }], error: null }
    } },
  })
  vm.runInContext(countsFetcher + '\n' + handler, context)
  // The Import deletes both notes in one transaction. RLS strips task_id.
  await context.handleNoteChange({ eventType: 'DELETE', new: {}, old: { id: 10 } })
  await context.handleNoteChange({ eventType: 'DELETE', new: {}, old: { id: 11 } })
  assert.equal(scheduled.size, 1)
  assert.equal(context.latestTaskNoteCountsFetchIdRef.current, 2)
  await scheduled.get('notes')()
  assert.equal(counts[5], undefined)
  assert.equal(counts[6], 1)
  assert.equal(reads, 1)
})

test('task snapshots keep live inserts, deletes, completion and moves made during pagination', () => {
  const oldRows = [
    { id: 1, list_id: 10, completed: false },
    { id: 2, list_id: 10, completed: false },
    { id: 3, list_id: 10, completed: false },
  ]
  const changes = new Map([
    ['1', { eventType: 'UPDATE', new: { id: 1, list_id: 10, completed: true } }],
    ['2', { eventType: 'DELETE', old: { id: 2 } }],
    ['3', { eventType: 'UPDATE', new: { id: 3, list_id: 20, completed: false } }],
    ['4', { eventType: 'INSERT', new: { id: 4, list_id: 10, completed: false } }],
  ])

  assert.deepEqual(mergeTaskSnapshot(oldRows, changes), [
    { id: 1, list_id: 10, completed: true },
    { id: 3, list_id: 20, completed: false },
    { id: 4, list_id: 10, completed: false },
  ])
  assert.deepEqual(mergeTaskSnapshot(oldRows, changes, 10), [
    { id: 1, list_id: 10, completed: true },
    { id: 4, list_id: 10, completed: false },
  ])
})

test('replaying a task already present in a server snapshot never duplicates it', () => {
  const rows = [{ id: 5, list_id: 1, title: 'Current', completed: true }]
  const changes = new Map([['5', {
    eventType: 'UPDATE', new: { id: 5, list_id: 1, completed: true },
  }]])
  assert.deepEqual(mergeTaskSnapshot(rows, changes), rows)
})

test('an older live update cannot replace a newer server snapshot', () => {
  const newer = { id: 9, task_id: 3, content: 'Newer', updated_at: '2026-09-29T12:00:00Z' }
  const oldEvent = { eventType: 'UPDATE', new: {
    id: 9, task_id: 3, content: 'Old', updated_at: '2026-09-29T11:00:00Z',
  } }
  assert.deepEqual(mergeNoteSnapshot([newer], new Map([['9', oldEvent]])), [newer])

  const newerTask = { id: 9, list_id: 1, completed: true, updated_at: newer.updated_at }
  assert.deepEqual(mergeTaskSnapshot([newerTask], new Map([['9', {
    ...oldEvent, new: { id: 9, list_id: 1, completed: false, updated_at: '2026-09-29T11:00:00Z' },
  }]])), [newerTask])
})

test('a local insert racing its own live event cannot double the list counter', () => {
  const liveRows = [{ id: 7, list_id: 2, title: 'Live' }]
  assert.deepEqual(upsertTaskRows(liveRows, [{ id: 7, list_id: 2, title: 'Saved' }]), [
    { id: 7, list_id: 2, title: 'Saved' },
  ])
  assert.deepEqual(upsertTaskRows(liveRows, [
    { id: 7, list_id: 2, title: 'Saved' },
    { id: 8, list_id: 2, title: 'Second' },
  ]).map((task) => task.id), [7, 8])
})

test('note snapshots preserve existing notes when a live insert arrives during loading', () => {
  const oldRows = [{ id: 1, task_id: 5, content: 'Existing' }]
  const changes = new Map([
    ['2', { eventType: 'INSERT', new: { id: 2, task_id: 5, content: 'New' } }],
  ])

  assert.deepEqual(mergeNoteSnapshot(oldRows, changes), [
    { id: 1, task_id: 5, content: 'Existing' },
    { id: 2, task_id: 5, content: 'New' },
  ])
  assert.deepEqual(mergeNoteSnapshot(oldRows, new Map([
    ['1', { eventType: 'DELETE', old: { id: 1, task_id: 5 } }],
  ])), [])
})

test('the newest note request always clears the loading state, even after a background refresh', () => {
  const fetchNotes = app.split('async function fetchNotes(')[1].split('async function fetchPendingInvites()')[0]
  assert.match(fetchNotes, /if \(latestNotesFetchTokenRef\.current\.get\(taskKey\) !== token\) \{\s*return\s*\}/)
  assert.match(fetchNotes, /if \(error\) \{[\s\S]{0,160}setNotesLoading\(false\)/)
  assert.match(fetchNotes, /setTaskNotes\(sorted\)[\s\S]{0,500}setNotesLoading\(false\)/)
  assert.doesNotMatch(fetchNotes, /if \(showLoading\) \{\s*setNotesLoading\(false\)/)
})

test('reconnect and visible recovery reconcile the list counters and note badges', () => {
  assert.match(app, /function reconcileAfterReconnect\(\)[\s\S]{0,550}fetchAllTasks\(false\),[\s\S]{0,100}fetchTaskNoteCounts\(false\)/)
  assert.match(app, /function handleVisibilityChange\(\)[\s\S]{0,1400}fetchTaskNoteCounts\(false\)/)
  assert.match(app, /function handleOnline\(\)[\s\S]{0,450}fetchTaskNoteCounts\(false\)/)
})

test('the live channel relays task and note events to other signed-in windows', () => {
  assert.match(app, /new BroadcastChannel\(`todo-live-sync-\$\{userId\}`\)/)
  assert.match(app, /liveSyncBroadcast\.onmessage = \(\{ data \}\) =>/)
  assert.match(app, /postMessage\(\{ table: 'tasks', payload \}\)/)
  assert.match(app, /postMessage\(\{ table: 'task_notes', payload \}\)/)
  assert.match(app, /liveSyncBroadcast\?\.close\(\)/)
})
