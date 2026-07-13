// src/lib/offline/sync-outbox.ts
'use client'
import { drainOutbox, registerOnlineSync } from './sync'
export { getBackoff } from './ops'
export { registerOnlineSync }
export async function syncOutbox(): Promise<{ synced: number; failed: number }> {
  return drainOutbox({ kinds: ['fall_dokument_upload'] })
}
