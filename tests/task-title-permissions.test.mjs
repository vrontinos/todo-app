import test from 'node:test'
import assert from 'node:assert/strict'
import { canRenameTaskTitle } from '../src/taskTitlePermissions.js'

test('manual task titles remain editable, including tasks marked Skroutz manually', () => {
  assert.equal(canRenameTaskTitle({ imported_title_locked: false }, 'editor', null), true)
  assert.equal(canRenameTaskTitle({ is_skroutz: true }, 'editor', null), true)
})

test('imported titles require the current user to be the approved editor', () => {
  const task = { imported_title_locked: true }
  assert.equal(canRenameTaskTitle(task, 'eshop', 'eshop'), true)
  assert.equal(canRenameTaskTitle(task, 'editor', 'eshop'), false)
  assert.equal(canRenameTaskTitle(task, 'eshop', null), false)
  assert.equal(canRenameTaskTitle(task, null, null), false)
  assert.equal(canRenameTaskTitle(null, 'eshop', 'eshop'), false)
})
