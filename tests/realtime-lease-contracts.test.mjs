import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { realtimeLeaseHandoffPatch } from '../scripts/realtime-lease-handoff-patch.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')
const appPath = path.join(root, 'src', 'App.jsx')
const appSource = fs.readFileSync(appPath, 'utf8')
const viteConfigSource = fs.readFileSync(path.join(root, 'vite.config.js'), 'utf8')
const transformedApp = realtimeLeaseHandoffPatch().transform(appSource, appPath)?.code

assert.equal(typeof transformedApp, 'string', 'realtime lease handoff transform must produce App.jsx code')

test('realtime lease stays scoped to the authenticated user and current tab', () => {
  assert.match(appSource, /const userId = session\.user\.id/)
  assert.match(appSource, /const tabId = `\$\{Date\.now\(\)\}-\$\{Math\.random\(\)\}`/)
  assert.match(appSource, /const leaseKey = `live-sync-owner-\$\{userId\}`/)
  assert.match(appSource, /const leaseMs = 15000/)
})

test('realtime ownership accepts only an empty, same-tab, or expired lease', () => {
  assert.match(
    appSource,
    /function readLease\(\)[\s\S]{0,300}JSON\.parse\(localStorage\.getItem\(leaseKey\) \|\| 'null'\)/,
  )
  assert.match(
    appSource,
    /function canOwnRealtime\(\)[\s\S]{0,300}return !lease \|\| lease\.tabId === tabId \|\| Number\(lease\.expiresAt\) < Date\.now\(\)/,
  )
  assert.match(
    appSource,
    /if \(!canOwnRealtime\(\)\) \{\s*stopRealtime\(\)\s*return\s*\}/,
  )
})

test('the owning tab renews its lease while keeping a single realtime channel', () => {
  assert.match(
    appSource,
    /function writeLease\(\)[\s\S]{0,400}localStorage\.setItem\([\s\S]{0,200}tabId,[\s\S]{0,160}expiresAt: Date\.now\(\) \+ leaseMs/,
  )
  assert.match(appSource, /heartbeatTimer = window\.setInterval\(writeLease, 5000\)/)
  assert.match(appSource, /if \(channel\) return/)
})

test('tabs recheck ownership through polling, visibility, and storage events', () => {
  assert.match(appSource, /checkTimer = window\.setInterval\(recheckRealtime, 5000\)/)
  assert.match(appSource, /document\.addEventListener\('visibilitychange', recheckRealtime\)/)
  assert.match(appSource, /window\.addEventListener\('storage', recheckRealtime\)/)
  assert.match(appSource, /document\.removeEventListener\('visibilitychange', recheckRealtime\)/)
  assert.match(appSource, /window\.removeEventListener\('storage', recheckRealtime\)/)
})

test('realtime lease cleanup removes only the lease owned by this tab', () => {
  assert.match(
    appSource,
    /stopRealtime\(\)[\s\S]{0,300}const lease = readLease\(\)[\s\S]{0,180}if \(lease\?\.tabId === tabId\) \{\s*localStorage\.removeItem\(leaseKey\)/,
  )
})

test('stopping realtime releases the current tab lease immediately', () => {
  assert.match(
    transformedApp,
    /function stopRealtime\(\)[\s\S]{0,500}const lease = readLease\(\)[\s\S]{0,180}if \(lease\?\.tabId === tabId\) \{\s*localStorage\.removeItem\(leaseKey\)/,
  )
})

test('stopping realtime never removes a lease owned by another tab', () => {
  assert.doesNotMatch(
    transformedApp,
    /function stopRealtime\(\)[\s\S]{0,500}localStorage\.removeItem\(leaseKey\)(?![\s\S]{0,80}lease\?\.tabId === tabId)/,
  )
  assert.match(
    transformedApp,
    /if \(lease\?\.tabId === tabId\) \{\s*localStorage\.removeItem\(leaseKey\)\s*\}/,
  )
})

test('realtime lease handoff patch runs before the existing Vite safety patches', () => {
  assert.match(
    viteConfigSource,
    /import \{ realtimeLeaseHandoffPatch \} from '\.\/scripts\/realtime-lease-handoff-patch\.js'/,
  )
  assert.match(
    viteConfigSource,
    /realtimeLeaseHandoffPatch\(\),\s*realtimeVisibilityRecoveryPatch\(\),\s*bulkActionSafetyPatch\(\),\s*authStorageSafetyPatch\(\),\s*react\(\)/,
  )
})

test('realtime lease handoff patch fails closed if its expected source contract drifts', () => {
  const plugin = realtimeLeaseHandoffPatch()
  assert.throws(
    () => plugin.transform('export default function App() { return null }', '/tmp/src/App.jsx'),
    /Expected block not found/,
  )
})
