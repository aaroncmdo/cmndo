'use client'
import { offlineDB, type Snapshot } from './db'

export function resolveOfflineData<T>(opts: { serverData?: T; snapshot: Snapshot | null }): {
  data: T | null
  source: 'live' | 'snapshot' | 'empty'
  staleSince: number | null
} {
  if (opts.serverData !== undefined) return { data: opts.serverData, source: 'live', staleSince: null }
  if (opts.snapshot) return { data: opts.snapshot.data as T, source: 'snapshot', staleSince: opts.snapshot.saved_at }
  return { data: null, source: 'empty', staleSince: null }
}

export async function saveSnapshot(input: {
  key: string
  scope: string
  role: string
  data: unknown
  /** test-only clock override */
  nowOverride?: number
}): Promise<void> {
  const now = input.nowOverride ?? Date.now()
  await offlineDB.snapshots.put({
    key: input.key,
    scope: input.scope,
    role: input.role,
    data: input.data,
    saved_at: now,
    last_read_at: now,
  })
}

export async function readSnapshot(key: string): Promise<Snapshot | null> {
  const snap = await offlineDB.snapshots.get(key)
  if (snap) void offlineDB.snapshots.update(key, { last_read_at: Date.now() }).catch(() => {})
  return snap ?? null
}

export async function touchSnapshot(key: string): Promise<void> {
  await offlineDB.snapshots.update(key, { last_read_at: Date.now() }).catch(() => {})
}

export async function patchSnapshot(
  ref: { scope: string; id: string },
  patch: (current: unknown) => unknown,
): Promise<void> {
  const key = `${ref.scope}:${ref.id}`
  const snap = await offlineDB.snapshots.get(key)
  if (!snap) return
  await offlineDB.snapshots.update(key, { data: patch(snap.data), saved_at: Date.now() })
}

/** Keep only the `cap` most-recently-read snapshots in a scope; delete the rest. */
export async function evictLRU(cap: number, scope?: string): Promise<number> {
  const coll = scope ? offlineDB.snapshots.where('scope').equals(scope) : offlineDB.snapshots.toCollection()
  const all = await coll.sortBy('last_read_at') // ascending: oldest first
  const excess = all.length - cap
  if (excess <= 0) return 0
  const toDelete = all.slice(0, excess).map((s) => s.key)
  await offlineDB.snapshots.bulkDelete(toDelete)
  return toDelete.length
}
