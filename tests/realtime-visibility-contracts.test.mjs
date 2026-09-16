import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { realtimeVisibilityRecoveryPatch } from '../scripts/realtime-visibility-recovery-patch.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')
const appPath = path.join(root, 'src', 'App.jsx')
const appSource = fs.readFileSync(appPath, 'utf8')
const viteConfigSource = fs.readFileSync(path.join(root, 'vite.config.js'), 'utf8')
const transformedApp = realtimeVisibilityRecoveryPatch().transform(appSource, appPath)?.code

assert.equal(typeof transformedApp, 'string', 'visibility recovery transform must produce App.jsx code')

test('visibility recovery runs only for a visible authenticated document', () => {
  assert.match(
    appSource,
    /function handleVisibilityChange\(\) \{[\s\S]{0,300}document\.visibilityState === 'visible' && session\?\.user\?\.id/,
  )
  assert.match(appSource, /document\.addEventListener\('visibilitychange', handleVisibilityChange\)/)
  assert.match(appSource, /document\.removeEventListener\('visibilitychange', handleVisibilityChange\)/)
})

test('visibility recovery remains throttled to avoid refetch storms', () => {
  assert.match(
    appSource,
    /if \(now - lastVisibilitySyncRef\.current < 60000\) \{\s*return\s*\}/,
  )
  assert.match(appSource, /lastVisibilitySyncRef\.current = now/)
})

test('visibility recovery refreshes lists and the currently selected task view', () => {
  assert.match(
    appSource,
    /function handleVisibilityChange\(\)[\s\S]{0,1400}fetchLists\(false\)[\s\S]{0,500}currentSelectedList\?\.id[\s\S]{0,250}fetchTasks\(currentSelectedList\.id, false, false\)/,
  )
})

test('visibility recovery does not overwrite a note while it is being edited', () => {
  assert.match(
    appSource,
    /function handleVisibilityChange\(\)[\s\S]{0,1400}const isEditingNote = editingNoteIdRef\.current !== null[\s\S]{0,700}currentActiveTask\?\.id && !isEditingNote[\s\S]{0,250}fetchNotes\(currentActiveTask\.id, false\)/,
  )
})

test('visible recovery also reconciles the complete task collection', () => {
  assert.match(
    transformedApp,
    /function handleVisibilityChange\(\)[\s\S]{0,1600}fetchLists\(false\)[\s\S]{0,120}fetchAllTasks\(false\)[\s\S]{0,500}fetchTasks\(currentSelectedList\.id, false, false\)/,
  )
})

test('visibility recovery patch is wired into the Vite build before existing safety patches', () => {
  assert.match(
    viteConfigSource,
    /import \{ realtimeVisibilityRecoveryPatch \} from '\.\/scripts\/realtime-visibility-recovery-patch\.js'/,
  )
  assert.match(
    viteConfigSource,
    /realtimeVisibilityRecoveryPatch\(\),\s*bulkActionSafetyPatch\(\),\s*authStorageSafetyPatch\(\),\s*react\(\)/,
  )
})

test('visibility recovery patch fails closed if its expected source contract drifts', () => {
  const plugin = realtimeVisibilityRecoveryPatch()
  assert.throws(
    () => plugin.transform('export default function App() { return null }', '/tmp/src/App.jsx'),
    /Expected block not found/,
  )
})
