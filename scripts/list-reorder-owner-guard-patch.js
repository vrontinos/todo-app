function replaceExactlyOnce(source, before, after, label) {
  const firstIndex = source.indexOf(before)
  if (firstIndex === -1) {
    throw new Error(`[list-reorder-owner-guard-patch] Expected block not found: ${label}`)
  }

  const secondIndex = source.indexOf(before, firstIndex + before.length)
  if (secondIndex !== -1) {
    throw new Error(`[list-reorder-owner-guard-patch] Expected exactly one block: ${label}`)
  }

  return source.slice(0, firstIndex) + after + source.slice(firstIndex + before.length)
}

export function listReorderOwnerGuardPatch() {
  return {
    name: 'list-reorder-owner-guard-patch',
    enforce: 'pre',
    transform(code, id) {
      const normalizedId = String(id || '').replaceAll('\\', '/')
      if (!normalizedId.endsWith('/src/App.jsx')) return null

      let next = code.replace(/\r\n?/g, '\n')

      next = replaceExactlyOnce(
        next,
        `function SortableListItem({
  list,
  isActive,
  isDraggingNative,`,
        `function SortableListItem({
  list,
  isActive,
  isDraggingNative,
  canReorder,`,
        'SortableListItem must receive the reorder capability',
      )

      next = replaceExactlyOnce(
        next,
        `    useSortable({ id: getListDndId(list.id) })`,
        `    useSortable({ id: getListDndId(list.id), disabled: !canReorder })`,
        'shared lists must not be sortable',
      )

      next = replaceExactlyOnce(
        next,
        `  async function saveListPositions(updatedLists) {
    if (isOffline) return`,
        `  function canReorderVisibleLists() {
    return (
      lists.length > 0 &&
      lists.every((list) => list.owner_user_id === session?.user?.id)
    )
  }

  async function saveListPositions(updatedLists) {
    if (isOffline || !canReorderVisibleLists()) return`,
        'list reorder persistence must require ownership of all visible lists',
      )

      next = replaceExactlyOnce(
        next,
        `  function handleListDragStart(event, listId) {
    event.dataTransfer.effectAllowed = 'move'`,
        `  function handleListDragStart(event, listId) {
    if (!canReorderVisibleLists()) return

    event.dataTransfer.effectAllowed = 'move'`,
        'native list drag start must fail closed for shared lists',
      )

      next = replaceExactlyOnce(
        next,
        `      setDropIndicator(null)
      return
    }

    if (!draggedListId || draggedListId === targetListId) {`,
        `      setDropIndicator(null)
      return
    }

    if (!canReorderVisibleLists()) {
      setDropIndicator(null)
      return
    }

    if (!draggedListId || draggedListId === targetListId) {`,
        'native list drag over must preserve task drops before the owner guard',
      )

      next = replaceExactlyOnce(
        next,
        `      setTaskDropListId(null)
      return
    }

    if (!draggedListId || draggedListId === targetListId || !dropIndicator) {`,
        `      setTaskDropListId(null)
      return
    }

    if (!canReorderVisibleLists()) {
      setDraggedListId(null)
      setDropIndicator(null)
      return
    }

    if (!draggedListId || draggedListId === targetListId || !dropIndicator) {`,
        'native list drop must preserve task moves before the owner guard',
      )

      next = replaceExactlyOnce(
        next,
        `    if (activeMeta.type === 'list' && overMeta.type === 'list') {
      const oldIndex = lists.findIndex((list) => String(list.id) === String(activeId))`,
        `    if (activeMeta.type === 'list' && overMeta.type === 'list') {
      if (!canReorderVisibleLists()) return

      const oldIndex = lists.findIndex((list) => String(list.id) === String(activeId))`,
        'global list drag end must fail closed for shared lists',
      )

      next = replaceExactlyOnce(
        next,
        `                            <SortableListItem
                              list={list}
                              isActive={selectedLists.includes(list.id)}`,
        `                            <SortableListItem
                              list={list}
                              canReorder={canReorderVisibleLists()}
                              isActive={selectedLists.includes(list.id)}`,
        'list rows must receive the owner-only reorder capability',
      )

      return { code: next, map: null }
    },
  }
}
