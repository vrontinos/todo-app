import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export async function checkForUpdates() {
  try {
    const update = await check()

    if (!update) return

    const confirmed = window.confirm(
      `Υπάρχει νέα έκδοση ${update.version}. Θέλεις να εγκατασταθεί τώρα;`
    )

    if (!confirmed) return

    await update.downloadAndInstall()
    await relaunch()
  } catch (error) {
    console.error('Updater error:', error)
  }
}