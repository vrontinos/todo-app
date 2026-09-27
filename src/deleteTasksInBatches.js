export const BULK_DELETE_BATCH_SIZE = 100

export class BulkTaskDeleteError extends Error {
  constructor(message, confirmed, total, cause) {
    super(message, { cause })
    this.name = 'BulkTaskDeleteError'
    this.confirmed = confirmed
    this.total = total
  }
}

export async function deleteTasksInBatches(
  taskIds,
  deleteBatch,
  onBatchDeleted,
  initialBatchSize = BULK_DELETE_BATCH_SIZE,
) {
  if (!Array.isArray(taskIds) || taskIds.length === 0) return 0

  const total = taskIds.length
  if (new Set(taskIds.map(String)).size !== total) {
    throw new BulkTaskDeleteError('Duplicate task IDs in selection', 0, total)
  }

  if (!Number.isSafeInteger(initialBatchSize) || initialBatchSize < 1) {
    throw new TypeError('Batch size must be a positive integer')
  }

  let confirmed = 0
  let batchSize = initialBatchSize

  while (confirmed < total) {
    const batch = taskIds.slice(confirmed, confirmed + batchSize)
    let response

    try {
      response = await deleteBatch(batch)
    } catch (error) {
      throw new BulkTaskDeleteError('Bulk delete request failed', confirmed, total, error)
    }

    // A statement timeout rolls back this RPC transaction. A smaller batch can
    // succeed without repeating any previously confirmed deletions.
    if (response?.error?.code === '57014' && batch.length > 1) {
      batchSize = Math.max(1, Math.floor(batch.length / 2))
      continue
    }

    if (response?.error) {
      throw new BulkTaskDeleteError('Bulk delete request failed', confirmed, total, response.error)
    }

    if (Number(response?.data) !== batch.length) {
      throw new BulkTaskDeleteError('Bulk delete count mismatch', confirmed, total)
    }

    confirmed += batch.length
    onBatchDeleted(batch, confirmed, total)
  }

  return confirmed
}
