// src/lib/offline/ops.ts
// Pure offline-layer types + decision helpers. NO Dexie / DOM imports —
// safe to unit-test in node. Consolidates backoff + dead-letter logic that
// was duplicated across outbox.ts / sync-outbox.ts / sync-gps-outbox.ts.

export type OutboxStatus = 'pending' | 'uploading' | 'failed' | 'dead'
export type ReplayClass = 'A' | 'B' | 'C' | 'D'

export const MAX_RETRIES = 10
export const BACKOFF_MS = [1000, 5000, 30000, 120000, 600000]

export function getBackoff(retryCount: number): number {
  return BACKOFF_MS[Math.min(retryCount, BACKOFF_MS.length - 1)]
}

export interface OutboxOp {
  id?: number
  kind: string
  idempotency_key: string
  replay_class: ReplayClass
  payload: unknown
  blob?: Blob
  blob_meta?: { file_name: string; content_type: string; file_size: number }
  entity_ref?: { scope: string; id: string }
  status: OutboxStatus
  retry_count: number
  last_attempt_at: number | null
  last_error?: string
  created_at: number
}

export type ReplayResult =
  | { outcome: 'done' }
  | { outcome: 'retry'; error: string }
  | { outcome: 'conflict'; error: string }

export interface OfflineHandler {
  kind: string
  /** Per-item replay (Classes A/B/C/D). Provide this OR drainBatch. */
  replay?(op: OutboxOp): Promise<ReplayResult>
  /** Batch replay (e.g. GPS). Returns the ids that are done vs. still failed. */
  drainBatch?(ops: OutboxOp[]): Promise<{ done: number[]; failed: number[]; error?: string }>
  /** Optional optimistic local snapshot patch on enqueue. */
  optimisticPatch?(current: unknown, op: OutboxOp): unknown
}

export function isReadyForRetry(
  op: Pick<OutboxOp, 'status' | 'retry_count' | 'last_attempt_at'>,
  now: number,
): boolean {
  if (op.status !== 'failed') return true
  if (op.retry_count === 0) return true
  const since = op.last_attempt_at != null ? now - op.last_attempt_at : Infinity
  return since >= getBackoff(op.retry_count)
}

export function nextStatusAfterFailure(retryCount: number): {
  status: OutboxStatus
  retry_count: number
} {
  const rc = retryCount + 1
  return { status: rc >= MAX_RETRIES ? 'dead' : 'failed', retry_count: rc }
}

export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
