import { writeTextFile, readTextFile, BaseDirectory } from '@tauri-apps/plugin-fs'

const LOG_FILE = 'updater.log'

function timestamp() {
  return new Date().toISOString()
}

export async function log(message) {
  const line = `[${timestamp()}] ${message}\n`

  try {
    let existing = ''

    try {
      existing = await readTextFile(LOG_FILE, {
        baseDir: BaseDirectory.AppLocalData,
      })
    } catch {
      existing = ''
    }

    await writeTextFile(LOG_FILE, existing + line, {
      baseDir: BaseDirectory.AppLocalData,
    })

    console.log('Log written:', line)
  } catch (error) {
    console.error('Logger error:', error)
  }
}