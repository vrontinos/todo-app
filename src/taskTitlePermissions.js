export function canRenameTaskTitle(task, userId, importedTitleEditorId) {
  if (!task) return false
  return !task.imported_title_locked || Boolean(userId && importedTitleEditorId === userId)
}
