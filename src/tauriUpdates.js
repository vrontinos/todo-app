import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export async function checkForUpdates() {
  try {
    const update = await check()

    if (!update) return

    console.log(`Installing update ${update.version}...`)

    await update.downloadAndInstall()
    await relaunch()
  } catch (error) {
    console.error('Updater error:', error)
  }
}