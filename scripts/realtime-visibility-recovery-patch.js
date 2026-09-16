function replaceExactlyOnce(source, before, after, label) {
  const firstIndex = source.indexOf(before)
  if (firstIndex === -1) {
    throw new Error(`[realtime-visibility-recovery-patch] Expected block not found: ${label}`)
  }

  const secondIndex = source.indexOf(before, firstIndex + before.length)
  if (secondIndex !== -1) {
    throw new Error(`[realtime-visibility-recovery-patch] Expected exactly one block: ${label}`)
  }

  return source.slice(0, firstIndex) + after + source.slice(firstIndex + before.length)
}

export function realtimeVisibilityRecoveryPatch() {
  return {
    name: 'realtime-visibility-recovery-patch',
    enforce: 'pre',
    transform(code, id) {
      const normalizedId = String(id || '').replaceAll('\\', '/')
      if (!normalizedId.endsWith('/src/App.jsx')) return null

      // Keep exact-match guards identical on Windows and Linux checkouts.
      let next = code.replace(/\r\n?/g, '\n')

      next = replaceExactlyOnce(
        next,
        `        Promise.all([
  fetchLists(false),
  currentSelectedList?.id`,
        `        Promise.all([
  fetchLists(false),
  fetchAllTasks(false),
  currentSelectedList?.id`,
        'visible recovery must reconcile the complete task collection'
      )

      return { code: next, map: null }
    },
  }
}
