// KFZ-180: Background-Sync — Outbox abarbeiten wenn online.
// Exponentieller Backoff: 1s, 5s, 30s, 2min, 10min max.

'use client'

import { offlineDB, updateOutboxStatus, removeFromOutbox, type OutboxItem } from './outbox'
import { createClient } from '@/lib/supabase/client'

const BACKOFF_MS = [1000, 5000, 30000, 120000, 600000]
let syncing = false

function getBackoff(retryCount: number): number {
  return BACKOFF_MS[Math.min(retryCount, BACKOFF_MS.length - 1)]
}

async function uploadSingleItem(item: OutboxItem): Promise<boolean> {
  if (!item.id) return false
  const supabase = createClient()

  await updateOutboxStatus(item.id, 'uploading')

  // 1. Upload to Supabase Storage
  const ext = item.file_name.split('.').pop() ?? 'bin'
  const timestamp = Date.now()
  const storagePath = `${item.fall_id}/${item.dokument_typ}_${timestamp}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('fall-dokumente')
    .upload(storagePath, item.file_blob, {
      contentType: item.content_type,
      upsert: false,
    })

  if (uploadErr) {
    await updateOutboxStatus(item.id, 'failed', uploadErr.message)
    return false
  }

  // 2. Insert into fall_dokumente
  const { data: user } = await supabase.auth.getUser()
  const { data: row, error: insertErr } = await supabase
    .from('fall_dokumente')
    .insert({
      fall_id: item.fall_id,
      dokument_typ: item.dokument_typ,
      ist_pflicht: item.ist_pflicht,
      ab_phase: item.ab_phase,
      storage_path: storagePath,
      original_filename: item.file_name,
      mime_type: item.content_type,
      groesse_bytes: item.file_size,
      ocr_status: item.content_type === 'application/pdf' || item.content_type.startsWith('image/') ? 'pending' : 'skipped',
      hochgeladen_von_user_id: user?.user?.id ?? null,
    })
    .select('id')
    .single()

  if (insertErr || !row) {
    await updateOutboxStatus(item.id, 'failed', insertErr?.message ?? 'DB-Insert fehlgeschlagen')
    return false
  }

  // 3. Trigger OCR (fire & forget)
  if (item.content_type === 'application/pdf' || item.content_type.startsWith('image/')) {
    fetch('/api/ocr-trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dokument_id: row.id }),
    }).catch(() => {})
  }

  // 4. Remove from Outbox
  await removeFromOutbox(item.id)
  return true
}

export async function syncOutbox(): Promise<{ synced: number; failed: number }> {
  if (syncing) return { synced: 0, failed: 0 }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { synced: 0, failed: 0 }

  syncing = true
  let synced = 0
  let failed = 0

  try {
    const items = await offlineDB.upload_outbox
      .where('status')
      .anyOf('pending', 'failed')
      .toArray()

    for (const item of items) {
      if (!item.id) continue

      // Skip items that need backoff
      if (item.status === 'failed' && item.retry_count > 0) {
        const backoff = getBackoff(item.retry_count)
        const elapsed = Date.now() - item.created_at - (item.retry_count * backoff)
        if (elapsed < 0) continue
      }

      const ok = await uploadSingleItem(item)
      if (ok) synced++
      else failed++
    }
  } finally {
    syncing = false
  }

  return { synced, failed }
}

// Auto-sync on online event
let listenerRegistered = false

export function registerOnlineSync(): void {
  if (listenerRegistered || typeof window === 'undefined') return
  listenerRegistered = true

  window.addEventListener('online', () => {
    // Small delay to let connection stabilize
    setTimeout(() => syncOutbox(), 1500)
  })

  // Also try on load if already online
  if (navigator.onLine) {
    setTimeout(() => syncOutbox(), 3000)
  }
}
