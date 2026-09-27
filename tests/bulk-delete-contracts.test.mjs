import test from 'node:test'
import assert from 'node:assert/strict'
import { BulkTaskDeleteError, BULK_DELETE_BATCH_SIZE, deleteTasksInBatches } from '../src/deleteTasksInBatches.js'

test('deletes more than 5,000 IDs in bounded, sequential, acknowledged RPC calls', async () => {
  const ids = Array.from({ length: 5201 }, (_, index) => index + 1)
  const committed = []
  const progress = []
  let inFlight = 0

  const result = await deleteTasksInBatches(ids, async (batch) => {
    assert.equal(inFlight++, 0)
    assert.ok(batch.length <= BULK_DELETE_BATCH_SIZE)
    await Promise.resolve()
    inFlight--
    committed.push(...batch)
    return { data: batch.length, error: null }
  }, (batch, confirmed, total) => {
    assert.equal(total, ids.length)
    assert.equal(confirmed, committed.length)
    assert.equal(batch.at(-1), committed.at(-1))
    progress.push(confirmed)
  })

  assert.equal(result, 5201)
  assert.deepEqual(committed, ids)
  assert.equal(progress.at(-1), 5201)
  assert.equal(progress.length, 53)
})

test('a statement timeout rolls back its batch and reduces later batch size', async () => {
  const ids = Array.from({ length: 230 }, (_, index) => index + 1)
  let firstCall = true
  const attempts = []
  const committed = []

  const result = await deleteTasksInBatches(ids, async (batch) => {
    attempts.push(batch.length)
    if (firstCall) {
      firstCall = false
      return { error: { code: '57014', message: 'statement timeout' } }
    }
    committed.push(...batch)
    return { data: batch.length, error: null }
  }, () => {})

  assert.equal(result, ids.length)
  assert.deepEqual(attempts, [100, 50, 50, 50, 50, 30])
  assert.deepEqual(committed, ids)
})

test('stops at the first unconfirmed batch and reports committed progress', async () => {
  const ids = Array.from({ length: 270 }, (_, index) => index + 1)
  let calls = 0
  const progress = []

  await assert.rejects(
    deleteTasksInBatches(ids, async (batch) => {
      calls++
      if (calls === 3) return { error: { code: '42501' } }
      return { data: batch.length, error: null }
    }, (_batch, confirmed) => progress.push(confirmed)),
    (error) => error instanceof BulkTaskDeleteError && error.confirmed === 200 && error.total === 270,
  )

  assert.equal(calls, 3)
  assert.deepEqual(progress, [100, 200])
})

test('rejects a short server response and repeated IDs without claiming success', async () => {
  await assert.rejects(
    deleteTasksInBatches([1, 2, 3], async () => ({ data: 2 }), () => {}),
    (error) => error instanceof BulkTaskDeleteError && error.confirmed === 0,
  )

  let calls = 0
  await assert.rejects(
    deleteTasksInBatches([1, 2, 2], async () => { calls++; return { data: 3 } }, () => {}),
    (error) => error instanceof BulkTaskDeleteError && error.confirmed === 0,
  )
  assert.equal(calls, 0)
})
