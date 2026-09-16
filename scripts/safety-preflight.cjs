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

function readText(path) {
  try {
    return fs.readFileSync(path, 'utf8')
  } catch (error) {
    fail(`Could not read ${path}: ${error.message}`)
    return ''
  }
}

const pkg = readJson('package.json')
const tauri = readJson('src-tauri/tauri.conf.json')
const desktopCapability = readJson('src-tauri/capabilities/desktop.json')

if (!pkg || !tauri || !desktopCapability) process.exit(1)

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

const cargoToml = readText('src-tauri/Cargo.toml')
const tauriLib = readText('src-tauri/src/lib.rs')
const desktopPermissions = Array.isArray(desktopCapability.permissions)
  ? desktopCapability.permissions
  : []

if (!pkg.dependencies?.['@tauri-apps/plugin-process']) {
  fail('Frontend process plugin dependency is required for updater relaunch')
} else {
  pass('Frontend process plugin dependency is present')
}

if (!/^tauri-plugin-process\s*=\s*"2"/m.test(cargoToml)) {
  fail('Rust tauri-plugin-process dependency is required for updater relaunch')
} else {
  pass('Rust process plugin dependency is present')
}

if (!tauriLib.includes('.plugin(tauri_plugin_process::init())')) {
  fail('Tauri builder must initialize tauri_plugin_process')
} else {
  pass('Tauri process plugin is initialized')
}

if (!desktopPermissions.includes('process:default')) {
  fail('Desktop capability must include process:default for relaunch')
} else {
  pass('Desktop process restart capability is enabled')
}

const viteConfig = readText('vite.config.js')
const authPatchPath = 'scripts/auth-storage-safety-patch.js'
const authPatchSource = readText(authPatchPath)
const authPatchImport = "import { authStorageSafetyPatch } from './scripts/auth-storage-safety-patch.js'"

if (!viteConfig.includes(authPatchImport) || !viteConfig.includes('authStorageSafetyPatch(),')) {
  fail('Vite must keep the auth storage safety patch enabled')
} else {
  pass('Auth storage safety patch is wired into Vite')
}

if (!authPatchSource.includes("localStorage.removeItem('savedLoginPassword')")) {
  fail('Auth storage safety patch must scrub legacy savedLoginPassword data')
} else {
  pass('Auth storage safety patch scrubs legacy plaintext password data')
}

const releaseWorkflowPath = '.github/workflows/release.yml'
const releaseWorkflow = readText(releaseWorkflowPath)

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
