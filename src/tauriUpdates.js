export async function checkForUpdates() {
  if (!window.__TAURI_INTERNALS__) return

  const { check } = await import('@tauri-apps/plugin-updater')
  const { relaunch } = await import('@tauri-apps/plugin-process')

  const update = await check()

  if (!update) return

  const confirmed = window.confirm(
    `Υπάρχει νέα έκδοση ${update.version}. Θέλεις να εγκατασταθεί τώρα;`
  )

  if (!confirmed) return

  await update.downloadAndInstall()
  await relaunch()
}