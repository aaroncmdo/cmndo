'use client'
import { offlineDB } from './db'
import { type OutboxOp, type OutboxStatus, generateUuid, nextStatusAfterFailure } from './ops'
import { getHandler } from './registry'
import { patchSnapshot } from './snapshot'

let persistRequested = false
export async function requestPersistIfPossible(): Promise<void> {
  if (persistRequested) return
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return
  persistRequested = true
  try {
    await navigator.storage.persist()
  } catch {
    // best-effort
  }
}

export async function enqueueOp(input: {
  kind: string
  replay_class: OutboxOp['replay_class']
  payload: unknown
  blob?: Blob
  blob_meta?: OutboxOp['blob_meta']
  entity_ref?: OutboxOp['entity_ref']
}): Promise<{ id: number; idempotency_key: string }> {
  void requestPersistIfPossible()
  const idempotency_key = generateUuid()
  const op: OutboxOp = {
    ...input,
    idempotency_key,
    status: 'pending',
    retry_count: 0,
    last_attempt_at: null,
    created_at: Date.now(),
  }
  const id = await offlineDB.mutation_outbox.add(op)

  // Optimistic local snapshot patch so the field user sees their own input.
  const handler = getHandler(input.kind)
  if (handler?.optimisticPatch && input.entity_ref) {
    await patchSnapshot(input.entity_ref, (cur) => handler.optimisticPatch!(cur, { ...op, id })).catch(
      () => {},
    )
  }
  return { id, idempotency_key }
}

export async function markOp(id: number, status: OutboxStatus, error?: string): Promise<void> {
  const item = await offlineDB.mutation_outbox.get(id)
  if (!item) return
  const now = Date.now()
  if (status === 'failed') {
    const { status: finalStatus, retry_count } = nextStatusAfterFailure(item.retry_count)
    await offlineDB.mutation_outbox.update(id, {
      status: finalStatus,
      retry_count,
      last_error: error,
      last_attempt_at: now,
    })
    return
  }
  await offlineDB.mutation_outbox.update(id, {
    status,
    last_error: error,
    last_attempt_at: status === 'uploading' ? now : item.last_attempt_at,
  })
}

export async function removeOp(id: number): Promise<void> {
  await offlineDB.mutation_outbox.delete(id)
}

export async function getPendingOps(): Promise<OutboxOp[]> {
  return offlineDB.mutation_outbox.where('status').anyOf('pending', 'failed').sortBy('created_at')
}

export async function getPendingCountByKind(kinds?: string[]): Promise<number> {
  const rows = await offlineDB.mutation_outbox
    .where('status')
    .anyOf('pending', 'uploading', 'failed')
    .toArray()
  return kinds ? rows.filter((r) => kinds.includes(r.kind)).length : rows.length
}

export async function getDeadCount(): Promise<number> {
  return offlineDB.mutation_outbox.where('status').equals('dead').count()
}

export async function resetDeadLetter(id: number): Promise<void> {
  await offlineDB.mutation_outbox.update(id, {
    status: 'pending',
    retry_count: 0,
    last_error: undefined,
    last_attempt_at: null,
  })
}

export async function recoverOutbox(): Promise<number> {
  return offlineDB.mutation_outbox.where('status').equals('uploading').modify({ status: 'pending' })
}
