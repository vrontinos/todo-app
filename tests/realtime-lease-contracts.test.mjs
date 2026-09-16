import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')
const appSource = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8')

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
