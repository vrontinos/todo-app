import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bulkActionSafetyPatch } from '../scripts/bulk-action-safety-patch.js'
import { authStorageSafetyPatch } from '../scripts/auth-storage-safety-patch.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')
const appPath = path.join(root, 'src', 'App.jsx')

const rawApp = fs.readFileSync(appPath, 'utf8')
const updaterSource = fs.readFileSync(path.join(root, 'src', 'tauriUpdates.js'), 'utf8')
const supabaseClientSource = fs.readFileSync(path.join(root, 'src', 'supabaseClient.js'), 'utf8')
const viteConfigSource = fs.readFileSync(path.join(root, 'vite.config.js'), 'utf8')
const inviteFunctionSource = fs.readFileSync(
  path.join(root, 'supabase', 'functions', 'send-list-invite-email', 'index.ts'),
  'utf8',
)
const supabaseConfigSource = fs.readFileSync(path.join(root, 'supabase', 'config.toml'), 'utf8')
const bulkTransformed = bulkActionSafetyPatch().transform(rawApp, appPath)?.code
const transformed = authStorageSafetyPatch().transform(bulkTransformed, appPath)?.code

assert.equal(typeof bulkTransformed, 'string', 'bulk safety transform must produce App.jsx code')
assert.equal(typeof transformed, 'string', 'auth storage transform must produce App.jsx code')

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

test('note counters prefer server aggregation with legacy fallback when the RPC is unavailable', () => {
  assert.match(transformed, /supabase\.rpc\('get_task_note_counts'\)/)
  assert.match(transformed, /const rpcMissing = error\?\.code === 'PGRST202'/)
  assert.match(
    transformed,
    /if \(rpcMissing\) \{[\s\S]{0,500}from\('task_notes'\)\.select\('task_id'\)/,
  )
  assert.match(
    transformed,
    /fallbackCounts\[note\.task_id\] = \(fallbackCounts\[note\.task_id\] \|\| 0\) \+ 1/,
  )
  assert.match(transformed, /counts\[row\.task_id\] = Number\(row\.note_count\) \|\| 0/)
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

test('desktop updater installs before requesting relaunch', () => {
  assert.match(updaterSource, /import \{ relaunch \} from '@tauri-apps\/plugin-process'/)
  const installIndex = updaterSource.indexOf('await update.downloadAndInstall()')
  const relaunchIndex = updaterSource.indexOf('await relaunch()')
  assert.ok(installIndex >= 0, 'updater must install the downloaded update')
  assert.ok(relaunchIndex > installIndex, 'relaunch must happen only after install completes')
})

test('Supabase auth keeps durable sessions and refreshes tokens', () => {
  assert.match(supabaseClientSource, /persistSession:\s*true/)
  assert.match(supabaseClientSource, /autoRefreshToken:\s*true/)
  assert.match(supabaseClientSource, /detectSessionInUrl:\s*true/)
})

test('auth storage safety patch is wired into the Vite build before React', () => {
  assert.match(
    viteConfigSource,
    /import \{ authStorageSafetyPatch \} from '\.\/scripts\/auth-storage-safety-patch\.js'/,
  )
  assert.match(
    viteConfigSource,
    /bulkActionSafetyPatch\(\),\s*authStorageSafetyPatch\(\),\s*react\(\)/,
  )
})

test('plaintext login password is never read from or written to localStorage', () => {
  assert.doesNotMatch(transformed, /localStorage\.getItem\('savedLoginPassword'\)/)
  assert.doesNotMatch(transformed, /localStorage\.setItem\('savedLoginPassword'/)
  assert.match(transformed, /const \[authPassword, setAuthPassword\] = useState\(''\)/)
  assert.ok(count(transformed, "localStorage.removeItem('savedLoginPassword')") >= 1)
})

test('automatic authentication relies on the persisted Supabase session, not a stored password', () => {
  assert.equal(count(transformed, 'signInWithPassword({'), 1)
  assert.doesNotMatch(transformed, /Auto login failed:/)
  assert.match(
    transformed,
    /localStorage\.removeItem\('savedLoginPassword'\)[\s\S]{0,220}if \(session \|\| autoLoginTried\) return/,
  )
})

test('manual sign out remains explicit and never restores a saved password', () => {
  assert.match(
    transformed,
    /async function handleSignOut\(\) \{[\s\S]{0,180}setAutoLoginTried\(true\)[\s\S]{0,180}await supabase\.auth\.signOut\(\)/,
  )
  assert.match(
    transformed,
    /localStorage\.getItem\('rememberLogin'\) === 'true'[\s\S]{0,220}setAuthEmail\(localStorage\.getItem\('savedLoginEmail'\) \|\| ''\)[\s\S]{0,120}setAuthPassword\(''\)/,
  )
})

test('remembered login keeps the email preference independently', () => {
  assert.match(transformed, /localStorage\.setItem\('rememberLogin', 'true'\)/)
  assert.match(transformed, /localStorage\.setItem\('savedLoginEmail', email\)/)
  assert.match(
    transformed,
    /localStorage\.getItem\('rememberLogin'\) === 'true'[\s\S]{0,300}localStorage\.getItem\('savedLoginEmail'\)/,
  )
})

test('invite email caller keeps the existing client payload contract', () => {
  assert.match(
    transformed,
    /functions\.invoke\('send-list-invite-email'[\s\S]{0,500}invitedEmail: email[\s\S]{0,300}listNames: targetListNames[\s\S]{0,200}appUrl: window\.location\.origin/,
  )
})

test('invite email function authenticates a real user before any delivery', () => {
  assert.match(inviteFunctionSource, /req\.headers\.get\('Authorization'\)/)
  assert.match(inviteFunctionSource, /supabase\.auth\.getUser\(token\)/)
  assert.match(inviteFunctionSource, /if \(userError \|\| !user\?\.id \|\| !user\.email\)/)
  assert.doesNotMatch(inviteFunctionSource, /SUPABASE_SERVICE_ROLE_KEY/)
})

test('invite email authorization is scoped to recent pending invites created by the caller', () => {
  assert.match(inviteFunctionSource, /\.from\('list_invites'\)/)
  assert.match(inviteFunctionSource, /\.eq\('invited_by_user_id', user\.id\)/)
  assert.match(inviteFunctionSource, /\.eq\('invited_email', invitedEmail\)/)
  assert.match(inviteFunctionSource, /\.eq\('status', 'pending'\)/)
  assert.match(inviteFunctionSource, /\.gte\('created_at', recentCutoff\)/)
  assert.match(inviteFunctionSource, /\.from\('lists'\)/)
  assert.match(inviteFunctionSource, /String\(list\.owner_user_id\) === String\(user\.id\)/)
})

test('invite email function does not trust client-supplied sender identity or list HTML', () => {
  assert.match(inviteFunctionSource, /payload\?\.invitedEmail \?\? payload\?\.email/)
  assert.match(inviteFunctionSource, /escapeHtml\(user\.email\)/)
  assert.match(inviteFunctionSource, /authorizedListNames[\s\S]{0,300}escapeHtml\(name\)/)
  assert.match(inviteFunctionSource, /to: invitedEmail/)
  assert.doesNotMatch(inviteFunctionSource, /const \{ email, inviterEmail, listNames, appUrl \} = await req\.json\(\)/)
  assert.doesNotMatch(inviteFunctionSource, /<strong>\$\{inviterEmail\}<\/strong>/)
})

test('invite email link is reduced to a safe http(s) origin', () => {
  assert.match(inviteFunctionSource, /parsed\.protocol !== 'https:' && parsed\.protocol !== 'http:'/)
  assert.match(inviteFunctionSource, /return parsed\.origin/)
  assert.match(inviteFunctionSource, /const appUrl = requestOrigin \|\| payloadAppUrl/)
  assert.match(inviteFunctionSource, /escapeHtml\(appUrl\)/)
})

test('stage-one invite hardening deliberately leaves gateway JWT verification unchanged', () => {
  assert.match(
    supabaseConfigSource,
    /\[functions\.send-list-invite-email\][\s\S]{0,160}verify_jwt\s*=\s*false/,
  )
})

test('mobile destructive interactions keep offline/search guards', () => {
  assert.match(transformed, /const swipeEnabled = isTouchInput && !isSearchMode && !isOffline/)
  assert.match(transformed, /if \(!isTouchInput \|\| isOffline \|\| isSearchMode\) return/)
})

test('bulk safety transform is fail-closed if its expected source contract drifts', () => {
  const plugin = bulkActionSafetyPatch()
  assert.throws(
    () => plugin.transform('export default function App() { return null }', '/tmp/src/App.jsx'),
    /Expected block not found/,
  )
})

test('auth storage transform is fail-closed if its expected source contract drifts', () => {
  const plugin = authStorageSafetyPatch()
  assert.throws(
    () => plugin.transform('export default function App() { return null }', '/tmp/src/App.jsx'),
    /Expected block not found/,
  )
})
