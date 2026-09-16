function replaceExactlyOnce(source, before, after, label) {
  const firstIndex = source.indexOf(before)
  if (firstIndex === -1) {
    throw new Error(`[bulk-action-patch] Expected block not found: ${label}`)
  }

  const secondIndex = source.indexOf(before, firstIndex + before.length)
  if (secondIndex !== -1) {
    throw new Error(`[bulk-action-patch] Expected exactly one block: ${label}`)
  }

  return source.slice(0, firstIndex) + after + source.slice(firstIndex + before.length)
}

export function bulkActionSafetyPatch() {
  return {
    name: 'bulk-action-safety-patch',
    enforce: 'pre',
    transform(code, id) {
      const normalizedId = String(id || '').replaceAll('\\', '/')
      if (!normalizedId.endsWith('/src/App.jsx')) return null

      let next = code

      next = replaceExactlyOnce(
        next,
        `          if (payload?.eventType === 'DELETE') {
            scheduleRealtimeRefresh('tasks', async () => {
              await fetchAllTasks(false)

              if (currentSelectedList?.id) {
                await fetchTasks(currentSelectedList.id, false, false)
              }

              if (
                currentActiveTask?.id &&
                !isEditingNote &&
                String(payload?.old?.id || payload?.new?.id || '') === String(currentActiveTask.id)
              ) {
                setActiveTask(null)
                setTaskNotes([])
                setEditingTaskTitle(false)
                setEditingNoteId(null)
                setEditingNoteValue('')
              }
            }, 0)

            return
          }`,
        `          if (payload?.eventType === 'DELETE') {
            applyTaskRealtimePayload(payload)

            if (
              currentActiveTask?.id &&
              !isEditingNote &&
              String(payload?.old?.id || payload?.new?.id || '') === String(currentActiveTask.id)
            ) {
              setActiveTask(null)
              setTaskNotes([])
              setEditingTaskTitle(false)
              setEditingNoteId(null)
              setEditingNoteValue('')
            }

            return
          }`,
        'task realtime delete refresh storm'
      )

      next = replaceExactlyOnce(
        next,
        `          if (eventType === 'DELETE' && currentActiveTask?.id && !isEditingNote) {
            await fetchNotes(currentActiveTask.id, false)
          }`,
        `          if (
            eventType === 'DELETE' &&
            currentActiveTask?.id &&
            String(currentActiveTask.id) === String(changedTaskId) &&
            !isEditingNote
          ) {
            await fetchNotes(currentActiveTask.id, false)
          }`,
        'scope note delete refresh to active task'
      )

      next = replaceExactlyOnce(
        next,
        `    const results = await Promise.all(
      taskIds.map((id) =>
        supabase
          .from('tasks')
          .update({
            list_id: targetListId,
            updated_at: now,
            updated_by: session?.user?.id || null,
          })
          .eq('id', id)
      )
    )

      const hasError = results.some((result) => result.error)
  if (hasError) {
    suppressOwnTaskRealtimeUntilRef.current = 0
    console.error('Σφάλμα αποθήκευσης σειράς εργασιών:', results)
    setSyncStatus('error')
    fetchTasks(selectedList?.id, false)
    return
  }`,
        `    const oldAllTasks = [...allTasks]
    taskIds.forEach((id) => markTaskMutation(id))

    const { error } = await supabase
      .from('tasks')
      .update({
        list_id: targetListId,
        updated_at: now,
        updated_by: session?.user?.id || null,
      })
      .in('id', taskIds)

  if (error) {
    taskIds.forEach((id) => clearTaskMutation(id))
    console.error('Σφάλμα μαζικής μετακίνησης εργασιών:', error)
    setTasks(oldTasks)
    setAllTasks(oldAllTasks)
    setSyncStatus('error')
    return
  }`,
        'drag bulk move request fanout'
      )

      next = replaceExactlyOnce(
        next,
        `    const results = await Promise.all(
      idsToMove.map((id) =>
        supabase
          .from('tasks')
          .update({
            list_id: targetList.id,
            updated_at: now,
            updated_by: session?.user?.id || null,
          })
          .eq('id', id)
      )
    )

    const hasError = results.some((result) => result.error)

    if (hasError) {
      console.error('Σφάλμα μετακίνησης πολλαπλών εργασιών:', results)
      setTasks(oldTasks)
      setSyncStatus('error')
      return
    }`,
        `    const oldAllTasks = [...allTasks]
    idsToMove.forEach((id) => markTaskMutation(id))

    const { error } = await supabase
      .from('tasks')
      .update({
        list_id: targetList.id,
        updated_at: now,
        updated_by: session?.user?.id || null,
      })
      .in('id', idsToMove)

    if (error) {
      idsToMove.forEach((id) => clearTaskMutation(id))
      console.error('Σφάλμα μετακίνησης πολλαπλών εργασιών:', error)
      setTasks(oldTasks)
      setAllTasks(oldAllTasks)
      setSyncStatus('error')
      return
    }`,
        'selected bulk move request fanout'
      )

      return { code: next, map: null }
    },
  }
}
