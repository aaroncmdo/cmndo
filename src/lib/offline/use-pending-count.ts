// AAR-388: Shared Hook fuer Live-Zahl der pending/dead Outbox-Items.
// Liest counts via getPendingCount/getGpsPendingCount/getDeadCount (./outbox)
// -- alle delegieren an die generalisierte mutation_outbox-Schicht (db.ts).
// useSlotPending fragt mutation_outbox direkt per idempotency_key ab.

'use client'

import { useEffect, useState } from 'react'
import { getDeadCountAll, getPendingCount, getGpsPendingCount } from './outbox'
import { offlineDB } from './db'
import type { OutboxStatus } from './ops'

export type PendingCounts = {
  uploadPending: number
  gpsPending: number
  dead: number
}

const INITIAL: PendingCounts = { uploadPending: 0, gpsPending: 0, dead: 0 }

export function usePendingCount(intervalMs = 5000): PendingCounts {
  const [counts, setCounts] = useState<PendingCounts>(INITIAL)

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const [uploadPending, gpsPending, dead] = await Promise.all([
          getPendingCount(),
          getGpsPendingCount(),
          getDeadCountAll(),
        ])
        if (!cancelled) setCounts({ uploadPending, gpsPending, dead })
      } catch {
        // Dexie kann kurz locked sein — ignorieren
      }
    }
    void poll()
    const id = setInterval(poll, intervalMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [intervalMs])

  return counts
}

export type SlotPendingStatus = 'idle' | 'pending' | 'uploading' | 'failed' | 'dead'

/**
 * Pollt den Outbox-Status für eine bestimmte Idempotency-Key-Referenz,
 * damit ein Slot einen PendingBadge anzeigen kann.
 */
export function useSlotPending(idempotencyKey: string | null, intervalMs = 3000): SlotPendingStatus {
  const [status, setStatus] = useState<SlotPendingStatus>('idle')

  useEffect(() => {
    if (!idempotencyKey) {
      setStatus('idle')
      return
    }
    let cancelled = false
    const poll = async () => {
      try {
        const item = await offlineDB.mutation_outbox
          .where('idempotency_key')
          .equals(idempotencyKey)
          .first()
        if (cancelled) return
        if (!item) {
          setStatus('idle')
          return
        }
        const next = item.status as OutboxStatus
        setStatus(next === 'pending' || next === 'uploading' || next === 'failed' || next === 'dead' ? next : 'idle')
      } catch {
        // ignorieren
      }
    }
    void poll()
    const id = setInterval(poll, intervalMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [idempotencyKey, intervalMs])

  return status
}
