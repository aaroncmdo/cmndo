'use client'
import { getPendingOps, markOp, removeOp } from './enqueue'
import { getHandler } from './registry'
import { isReadyForRetry, type OutboxOp } from './ops'
import './handlers' // side-effect: registers built-in handlers

let syncing = false

// 2026-07-17 (500-Attribution der Regel-4-Abnahme): Der Next-Server-Action-Transport
// kann in seltenen Faellen NIE settlen (Action-Response-Stream bricht ab, z.B. wenn
// der revalidatePath-Re-Render der eigenen Route wirft). Ohne Guard hing der Drain
// dann unendlich am `await handler.replay(op)`: die Op blieb 'uploading' UND
// `syncing` blieb true -> JEDER weitere Drain war bis zum Reload ein No-op.
// Timeout-Race + catch garantieren Bookkeeping + Fortschritt; der spaetere Retry
// ist durch Backoff + die CAS-/Idempotenz-Guards der Handler abgesichert.
const DEFAULT_REPLAY_TIMEOUT_MS = 60_000

async function guarded<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  fallback: (reason: string) => T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback('Replay-Timeout — Transport haengt')), timeoutMs)
      }),
    ])
  } catch (e) {
    return fallback(e instanceof Error ? e.message : 'Replay-Wurf ausserhalb des Handler-Catch')
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export async function drainOutbox(opts?: {
  kinds?: string[]
  replayTimeoutMs?: number
}): Promise<{ synced: number; failed: number }> {
  if (syncing) return { synced: 0, failed: 0 }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { synced: 0, failed: 0 }

  syncing = true
  let synced = 0
  let failed = 0
  const now = Date.now()
  const timeoutMs = opts?.replayTimeoutMs ?? DEFAULT_REPLAY_TIMEOUT_MS

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
        const ids = kindOps.map((o) => o.id!).filter(Boolean)
        for (const id of ids) await markOp(id, 'uploading')
        const { done, failed: failedIds, error } = await guarded(
          () => handler.drainBatch!(kindOps),
          timeoutMs,
          (reason) => ({ done: [] as number[], failed: ids, error: reason }),
        )
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
          const result = await guarded(
            () => handler.replay!(op),
            timeoutMs,
            (reason) => ({ outcome: 'retry' as const, error: reason }),
          )
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
