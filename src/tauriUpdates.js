export async function checkForUpdates() {
  try {
    alert('Checking for updates...')

    const { check } = await import('@tauri-apps/plugin-updater')
    const { relaunch } = await import('@tauri-apps/plugin-process')

    const update = await check()

    if (!update) {
      alert('No update found')
      return
    }

    const confirmed = window.confirm(
      `Υπάρχει νέα έκδοση ${update.version}. Θέλεις να εγκατασταθεί τώρα;`
    )

    if (!confirmed) return

    await update.downloadAndInstall()
    await relaunch()
  } catch (error) {
    alert(`Updater error: ${error?.message || error}`)
    console.error(error)
  }
}