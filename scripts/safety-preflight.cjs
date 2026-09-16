const fs = require('fs')

function fail(message) {
  console.error(`SAFETY CHECK FAILED: ${message}`)
  process.exitCode = 1
}

function pass(message) {
  console.log(`OK: ${message}`)
}

function readJson(path) {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`Could not read ${path}: ${error.message}`)
    return null
  }
}

const pkg = readJson('package.json')
const tauri = readJson('src-tauri/tauri.conf.json')

if (!pkg || !tauri) process.exit(1)

const semver = /^\d+\.\d+\.\d+$/

if (!semver.test(String(pkg.version || ''))) {
  fail(`package.json version is not x.y.z: ${pkg.version}`)
} else {
  pass(`package.json version ${pkg.version}`)
}

if (pkg.version !== tauri.version) {
  fail(`Version mismatch: package.json=${pkg.version}, tauri.conf.json=${tauri.version}`)
} else {
  pass(`package.json and Tauri versions match (${pkg.version})`)
}

const refName = String(process.env.GITHUB_REF_NAME || '')
const refType = String(process.env.GITHUB_REF_TYPE || '')
if (refType === 'tag' || /^v\d+\.\d+\.\d+$/.test(refName)) {
  const tagVersion = refName.replace(/^v/, '')
  if (tagVersion !== pkg.version) {
    fail(`Release tag ${refName} does not match app version ${pkg.version}`)
  } else {
    pass(`Release tag ${refName} matches app version`)
  }
}

if (tauri?.bundle?.createUpdaterArtifacts !== true) {
  fail('Tauri bundle.createUpdaterArtifacts must be true')
} else {
  pass('Tauri updater artifacts are enabled')
}

const targets = Array.isArray(tauri?.bundle?.targets) ? tauri.bundle.targets : []
if (!targets.includes('nsis')) {
  fail('Tauri bundle targets must include nsis')
} else {
  pass('NSIS bundle target is enabled')
}

const updaterEndpoints = tauri?.plugins?.updater?.endpoints
const expectedUpdaterEndpoint = 'https://github.com/vrontinos/todo-app/releases/latest/download/latest.json'
if (!Array.isArray(updaterEndpoints) || !updaterEndpoints.includes(expectedUpdaterEndpoint)) {
  fail(`Updater endpoint must include ${expectedUpdaterEndpoint}`)
} else {
  pass('Updater endpoint is correct')
}

if (tauri?.plugins?.updater?.windows?.installMode !== 'quiet') {
  fail('Updater Windows installMode must remain quiet')
} else {
  pass('Updater Windows install mode is quiet')
}

if (tauri?.bundle?.windows?.nsis?.installMode !== 'currentUser') {
  fail('NSIS installMode must remain currentUser')
} else {
  pass('NSIS install mode is currentUser')
}

const releaseWorkflowPath = '.github/workflows/release.yml'
let releaseWorkflow = ''
try {
  releaseWorkflow = fs.readFileSync(releaseWorkflowPath, 'utf8')
} catch (error) {
  fail(`Could not read ${releaseWorkflowPath}: ${error.message}`)
}

const requiredReleaseMarkers = [
  'v*.*.*',
  'TAURI_SIGNING_PRIVATE_KEY',
  'TAURI_SIGNING_PRIVATE_KEY_PASSWORD',
  'Create latest.json (NSIS)',
  'Publish Release',
  'latest.json',
]

for (const marker of requiredReleaseMarkers) {
  if (!releaseWorkflow.includes(marker)) {
    fail(`release.yml is missing required marker: ${marker}`)
  }
}
if (requiredReleaseMarkers.every((marker) => releaseWorkflow.includes(marker))) {
  pass('Release workflow contains required signing/updater steps')
}

const envPath = '.env'
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8')
  const forbiddenPatterns = [
    /service[_-]?role/i,
    /SUPABASE_SERVICE_ROLE_KEY/i,
    /TAURI_SIGNING_PRIVATE_KEY\s*=/i,
    /RESEND_API_KEY\s*=/i,
  ]

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(env)) {
      fail(`Committed .env appears to contain a forbidden secret pattern: ${pattern}`)
    }
  }
  if (!forbiddenPatterns.some((pattern) => pattern.test(env))) {
    pass('Committed .env contains no obvious privileged secret patterns')
  }
}

if (process.exitCode) {
  process.exit(process.exitCode)
}

console.log('Production safety preflight passed')
