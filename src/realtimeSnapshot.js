// A page request can finish after a live change. Replay changes received while
// it was in flight so its older snapshot cannot undo the latest task state.
function isOlderThanSnapshot(incoming, current) {
  if (!incoming?.updated_at || !current?.updated_at) return false
  const incomingTime = Date.parse(incoming.updated_at)
  const currentTime = Date.parse(current.updated_at)
  return Number.isFinite(incomingTime) && Number.isFinite(currentTime) && incomingTime < currentTime
}

export function mergeTaskSnapshot(rows, changes, listId = null) {
  if (!changes?.size) return rows

  const byId = new Map(rows.map((task) => [String(task.id), task]))

  for (const payload of changes.values()) {
    const id = payload.new?.id ?? payload.old?.id
    if (id == null) continue

    const key = String(id)
    if (payload.eventType === 'DELETE') {
      byId.delete(key)
      continue
    }

    if (!payload.new) continue
    const existing = byId.get(key)
    if (isOlderThanSnapshot(payload.new, existing)) continue
    const task = { ...existing, ...payload.new }
    if (listId != null && String(task.list_id) !== String(listId)) {
      byId.delete(key)
    } else {
      byId.set(key, task)
    }
  }

  return [...byId.values()]
}

export function mergeNoteSnapshot(rows, changes) {
  if (!changes?.size) return rows

  const byId = new Map(rows.map((note) => [String(note.id), note]))

  for (const payload of changes.values()) {
    const id = payload.new?.id ?? payload.old?.id
    if (id == null) continue

    const key = String(id)
    if (payload.eventType === 'DELETE') {
      byId.delete(key)
    } else if (payload.new) {
      const existing = byId.get(key)
      if (!isOlderThanSnapshot(payload.new, existing)) {
        byId.set(key, { ...existing, ...payload.new })
      }
    }
  }

  return [...byId.values()]
}

export function upsertTaskRows(rows, incoming) {
  const byId = new Map(rows.map((task) => [String(task.id), task]))
  for (const task of incoming) byId.set(String(task.id), task)
  return [...byId.values()]
}
