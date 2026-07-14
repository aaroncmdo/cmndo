'use client'
import { getPendingOps, markOp, removeOp } from './enqueue'
import { getHandler } from './registry'
import { isReadyForRetry, type OutboxOp } from './ops'
import './handlers' // side-effect: registers built-in handlers

let syncing = false

export async function drainOutbox(opts?: { kinds?: string[] }): Promise<{ synced: number; failed: number }> {
  if (syncing) return { synced: 0, failed: 0 }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { synced: 0, failed: 0 }

  syncing = true
  let synced = 0
  let failed = 0
  const now = Date.now()

  try {
    let ops = await getPendingOps()
    if (opts?.kinds) ops = ops.filter((o) => opts.kinds!.includes(o.kind))
    ops = ops.filter((o) => isReadyForRetry(o, now))

    // Group by kind so batch handlers get all their ops at once.
    const byKind = new Map<string, OutboxOp[]>()
    for (const op of ops) {
      const arr = byKind.get(op.kind) ?? []
      arr.push(op)
      byKind.set(op.kind, arr)
    }

    for (const [kind, kindOps] of byKind) {
      const handler = getHandler(kind)
      if (!handler) continue // no handler registered → skip (leave pending)

      if (handler.drainBatch) {
        for (const id of kindOps.map((o) => o.id!).filter(Boolean)) await markOp(id, 'uploading')
        const { done, failed: failedIds, error } = await handler.drainBatch(kindOps)
        for (const id of done) await removeOp(id)
        for (const id of failedIds) await markOp(id, 'failed', error ?? 'Batch fehlgeschlagen')
        synced += done.length
        failed += failedIds.length
        continue
      }

      if (handler.replay) {
        for (const op of kindOps) {
          if (!op.id) continue
          await markOp(op.id, 'uploading')
          const result = await handler.replay(op)
          if (result.outcome === 'done') {
            await removeOp(op.id)
            synced++
          } else if (result.outcome === 'conflict') {
            // Token-TTL-Dead-Letter: ein nicht-transienter conflict (z.B. Flow-Token
            // abgelaufen) darf NICHT still gedroppt + faelschlich als synced gezaehlt
            // werden. Als Dead-Letter behalten (inspizierbar, vom kuenftigen All-Kinds-
            // Dead-Letter-UI surfac-/dismissbar) + ehrlich als failed melden.
            await markOp(op.id, 'dead', result.error)
            failed++
          } else {
            await markOp(op.id, 'failed', result.error)
            failed++
          }
        }
      }
    }
  } finally {
    syncing = false
  }

  return { synced, failed }
}

let listenerRegistered = false
export function registerOnlineSync(): void {
  if (listenerRegistered || typeof window === 'undefined') return
  listenerRegistered = true
  window.addEventListener('online', () => {
    setTimeout(() => drainOutbox(), 1500)
  })
  if (navigator.onLine) {
    setTimeout(() => drainOutbox(), 3000)
  }
}
