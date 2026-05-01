const fs = require('fs')
const { execSync } = require('child_process')

function run(cmd) {
  console.log('> ' + cmd)
  execSync(cmd, { stdio: 'inherit' })
}

function bumpPatch(version) {
  const [a, b, c] = version.split('.').map(Number)
  return `${a}.${b}.${c + 1}`
}

const pkg = JSON.parse(fs.readFileSync('package.json'))
const tauri = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json'))

const next = bumpPatch(pkg.version)

console.log('Old version:', pkg.version)
console.log('New version:', next)

pkg.version = next
tauri.version = next

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2))
fs.writeFileSync('src-tauri/tauri.conf.json', JSON.stringify(tauri, null, 2))

run('git add .')
run(`git commit -m "release ${next}"`)
run(`git tag v${next}`)
run('git push')
run(`git push origin v${next}`)

console.log('DONE')