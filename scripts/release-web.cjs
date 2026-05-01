const readline = require('readline')
const { execSync } = require('child_process')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

rl.question('Γράψε περιγραφή update: ', (msg) => {
  try {
    execSync('git add .', { stdio: 'inherit' })
    execSync(`git commit -m "Update: ${msg}"`, { stdio: 'inherit' })
    execSync('git push origin main', { stdio: 'inherit' })

    console.log('\n✅ Web update έγινε')
  } catch (e) {
    console.error('\n❌ Error:', e.message)
  }

  rl.close()
})