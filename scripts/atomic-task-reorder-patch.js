function replaceExactlyOnce(source, before, after, label) {
  const firstIndex = source.indexOf(before)
  if (firstIndex === -1) {
    throw new Error(`[atomic-task-reorder-patch] Expected block not found: ${label}`)
  }

  const secondIndex = source.indexOf(before, firstIndex + before.length)
  if (secondIndex !== -1) {
    throw new Error(`[atomic-task-reorder-patch] Expected exactly one block: ${label}`)
  }

  return source.slice(0, firstIndex) + after + source.slice(firstIndex + before.length)
}

export function atomicTaskReorderPatch() {
  return {
    name: 'atomic-task-reorder-patch',
    enforce: 'pre',
    transform(code, id) {
      const normalizedId = String(id || '').replaceAll('\\', '/')
      if (!normalizedId.endsWith('/src/App.jsx')) return null

      let next = code.replace(/\r\n?/g, '\n')

      next = replaceExactlyOnce(
        next,
        ` async function saveTaskPositions(updatedTasks) {
  if (isOffline) return

  suppressOwnTaskRealtimeUntilRef.current = Date.now() + 1500
  markSaving()

  const now = new Date().toISOString()

  const results = await Promise.all(
    updatedTasks.map((task, index) =>
      supabase
        .from('tasks')
        .update({
          position: index + 1,
          updated_at: now,
          updated_by: session?.user?.id || null,
        })
        .eq('id', task.id)
    )
  )

  const hasError = results.some((result) => result.error)
  if (hasError) {
    suppressOwnTaskRealtimeUntilRef.current = 0
    console.error('Σφάλμα αποθήκευσης σειράς εργασιών:', results)
    setSyncStatus('error')
    fetchTasks(selectedList?.id, false)
    return
  }

  markSynced()
}`,
        ` async function saveTaskPositions(updatedTasks) {
  if (isOffline) return

  suppressOwnTaskRealtimeUntilRef.current = Date.now() + 1500
  markSaving()

  const { error } = await supabase.rpc('reorder_tasks_atomic', {
    p_list_id: selectedList?.id,
    p_task_ids: updatedTasks.map((task) => task.id),
  })

  if (error) {
    suppressOwnTaskRealtimeUntilRef.current = 0
    console.error('Σφάλμα αποθήκευσης σειράς εργασιών:', error)
    setSyncStatus('error')
    fetchTasks(selectedList?.id, false)
    return
  }

  markSynced()
}`,
        'saveTaskPositions must persist through the atomic task reorder RPC',
      )

      return { code: next, map: null }
    },
  }
}
