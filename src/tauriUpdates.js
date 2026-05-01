import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { log } from './updaterLogger'

export async function checkForUpdates() {
  try {
    await log('Checking for updates...')

    const update = await check()

    if (!update) {
      await log('No update found')
      return
    }

    await log(`Update found: ${update.version}`)

    await log('Download + install started')
    await update.downloadAndInstall()
    await log('Download + install finished')

    await log('Relaunching app')
    await relaunch()
  } catch (error) {
    await log('Updater error: ' + error)
    console.error('Updater error:', error)
  }
}