import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export async function checkForUpdates() {
  try {
    alert('Checking for updates...')

    const update = await check()

    if (!update) {
      alert('No update found')
      return
    }

    const confirmed = window.confirm(
      `Υπάρχει νέα έκδοση ${update.version}. Θέλεις να εγκατασταθεί τώρα;`
    )

    if (!confirmed) return

    let downloaded = 0
    let contentLength = 0

    await update.downloadAndInstall((event) => {
      if (event.event === 'Started') {
        contentLength = event.data.contentLength || 0
        alert(`Ξεκίνησε download: ${contentLength} bytes`)
      }

      if (event.event === 'Progress') {
        downloaded += event.data.chunkLength || 0
        console.log(`Downloaded ${downloaded} / ${contentLength}`)
      }

      if (event.event === 'Finished') {
        alert('Το download τελείωσε. Γίνεται εγκατάσταση...')
      }
    })

    alert('Το update εγκαταστάθηκε. Γίνεται restart...')
    await relaunch()
  } catch (error) {
    alert(`Updater error: ${error?.message || error}`)
    console.error(error)
  }
}