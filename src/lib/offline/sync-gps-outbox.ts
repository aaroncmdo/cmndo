// src/lib/offline/sync-gps-outbox.ts
'use client'
import { drainOutbox, registerOnlineSync } from './sync'
import { getPendingCountByKind } from './enqueue'
export async function syncGpsOutbox(): Promise<{ synced: number; failed: number }> {
  return drainOutbox({ kinds: ['gps_position'] })
}
export async function getGpsPendingCount(): Promise<number> {
  return getPendingCountByKind(['gps_position'])
}
/** Back-compat: the generalized online-sync drains ALL kinds, incl. GPS. */
export function registerGpsOnlineSync(): void {
  registerOnlineSync()
}
