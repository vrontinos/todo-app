function replaceExactlyOnce(source, before, after, label) {
  const firstIndex = source.indexOf(before)
  if (firstIndex === -1) {
    throw new Error(`[atomic-list-reorder-patch] Expected block not found: ${label}`)
  }

  const secondIndex = source.indexOf(before, firstIndex + before.length)
  if (secondIndex !== -1) {
    throw new Error(`[atomic-list-reorder-patch] Expected exactly one block: ${label}`)
  }

  return source.slice(0, firstIndex) + after + source.slice(firstIndex + before.length)
}

export function atomicListReorderPatch() {
  return {
    name: 'atomic-list-reorder-patch',
    enforce: 'pre',
    transform(code, id) {
      const normalizedId = String(id || '').replaceAll('\\', '/')
      if (!normalizedId.endsWith('/src/App.jsx')) return null

      let next = code.replace(/\r\n?/g, '\n')

      next = replaceExactlyOnce(
        next,
        `    const results = await Promise.all(
      updatedLists.map((list, index) =>
        supabase.from('lists').update({ position: index + 1 }).eq('id', list.id)
      )
    )

    const hasError = results.some((result) => result.error)
    if (hasError) {
      console.error('Σφάλμα αποθήκευσης σειράς λιστών:', results)`,
        `    const { error } = await supabase.rpc('reorder_lists_atomic', {
      p_list_ids: updatedLists.map((list) => list.id),
    })

    if (error) {
      console.error('Σφάλμα αποθήκευσης σειράς λιστών:', error)`,
        'saveListPositions must persist through the atomic list reorder RPC',
      )

      return { code: next, map: null }
    },
  }
}
