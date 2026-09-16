function replaceExactlyOnce(source, before, after, label) {
  const firstIndex = source.indexOf(before)
  if (firstIndex === -1) {
    throw new Error(`[realtime-lease-handoff-patch] Expected block not found: ${label}`)
  }

  const secondIndex = source.indexOf(before, firstIndex + before.length)
  if (secondIndex !== -1) {
    throw new Error(`[realtime-lease-handoff-patch] Expected exactly one block: ${label}`)
  }

  return source.slice(0, firstIndex) + after + source.slice(firstIndex + before.length)
}

export function realtimeLeaseHandoffPatch() {
  return {
    name: 'realtime-lease-handoff-patch',
    enforce: 'pre',
    transform(code, id) {
      const normalizedId = String(id || '').replaceAll('\\', '/')
      if (!normalizedId.endsWith('/src/App.jsx')) return null

      let next = code.replace(/\r\n?/g, '\n')

      next = replaceExactlyOnce(
        next,
        `    if (channel) {
      const oldChannel = channel
      channel = null
      supabase.removeChannel(oldChannel)
    }
  }

  function startRealtime() {`,
        `    if (channel) {
      const oldChannel = channel
      channel = null
      supabase.removeChannel(oldChannel)
    }

    const lease = readLease()
    if (lease?.tabId === tabId) {
      localStorage.removeItem(leaseKey)
    }
  }

  function startRealtime() {`,
        'stopRealtime must release only the current tab lease',
      )

      return { code: next, map: null }
    },
  }
}
