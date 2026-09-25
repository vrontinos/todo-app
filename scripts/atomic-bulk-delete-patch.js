function replaceExactlyOnce(source, before, after, label) {
  const firstIndex = source.indexOf(before)
  if (firstIndex === -1) {
    throw new Error(`[atomic-bulk-delete-patch] Expected block not found: ${label}`)
  }

  const secondIndex = source.indexOf(before, firstIndex + before.length)
  if (secondIndex !== -1) {
    throw new Error(`[atomic-bulk-delete-patch] Expected exactly one block: ${label}`)
  }

  return source.slice(0, firstIndex) + after + source.slice(firstIndex + before.length)
}

export function atomicBulkDeletePatch() {
  return {
    name: 'atomic-bulk-delete-patch',
    enforce: 'pre',
    transform(code, id) {
      const normalizedId = String(id || '').replaceAll('\\', '/')
      if (!normalizedId.endsWith('/src/App.jsx')) return null

      let next = code.replace(/\r\n?/g, '\n')

      next = replaceExactlyOnce(
        next,
        `const oldTasks = [...tasks]\nconst idsToDelete = [...selectedTasks]`,
        `const oldTasks = [...tasks]\nconst oldAllTasks = [...allTasks]\nconst idsToDelete = [...selectedTasks]`,
        'bulk delete task snapshots',
      )

      next = replaceExactlyOnce(
        next,
        `const { error } = await supabase\n  .from('tasks')\n  .delete()\n  .in('id', idsToDelete)`,
        `const { error } = await supabase.rpc('delete_tasks_atomic', {\n  p_task_ids: idsToDelete,\n})`,
        'bulk delete request',
      )

      next = replaceExactlyOnce(
        next,
        `  setTasks(oldTasks)\nsetBulkProgress(null)`,
        `  setTasks(oldTasks)\n  setAllTasks(oldAllTasks)\nsetBulkProgress(null)`,
        'bulk delete rollback',
      )

      return { code: next, map: null }
    },
  }
}
