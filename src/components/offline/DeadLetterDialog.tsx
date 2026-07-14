'use client'

// AAR-388: Dead-Letter-Queue-UI.
// AAR-781: Migriert auf Modal-Primitive.

import { useEffect, useState } from 'react'
import { AlertTriangleIcon, RefreshCwIcon, Trash2Icon, XIcon } from 'lucide-react'
import { removeFromOutbox, resetDeadLetter, getDeadItemsAll, type DeadLetterView } from '@/lib/offline/outbox'
import { drainOutbox } from '@/lib/offline/sync'
import { Modal } from '@/components/primitives'

type Props = {
  open: boolean
  onClose: () => void
}

export default function DeadLetterDialog({ open, onClose }: Props) {
  const [items, setItems] = useState<DeadLetterView[]>([])
  const [busy, setBusy] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const load = async () => {
      const rows = await getDeadItemsAll()
      if (!cancelled) setItems(rows)
    }
    void load()
    const id = setInterval(load, 3000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [open])

  const handleRetry = async (item: DeadLetterView) => {
    if (!item.id) return
    setBusy(item.id)
    try {
      await resetDeadLetter(item.id)
      await drainOutbox()
    } finally {
      setBusy(null)
    }
  }

  const handleDelete = async (item: DeadLetterView) => {
    if (!item.id) return
    setBusy(item.id)
    try {
      await removeFromOutbox(item.id)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={512} noPadding hideCloseButton ariaLabel="Fehlgeschlagene Synchronisierungen">
      <div className="flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 64px)' }}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-claimondo-border">
          <div className="flex items-center gap-2 text-claimondo-navy">
            <AlertTriangleIcon className="w-5 h-5 text-danger-strong" />
            <h2 className="text-sm font-semibold">Dauerhaft fehlgeschlagene Einträge</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-ios-md hover:bg-claimondo-bg text-claimondo-ondo"
            aria-label="Schließen"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4" style={{ maxHeight: '60vh' }}>
          {items.length === 0 ? (
            <p className="text-sm text-claimondo-ondo">Keine fehlgeschlagenen Einträge.</p>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.id} className="rounded-ios-lg border border-danger/30 bg-danger-soft/50 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-claimondo-navy truncate">{item.label}</p>
                      <p className="text-[11px] text-claimondo-ondo mt-0.5">
                        {item.detail ? `${item.detail} · ` : ''}{item.retry_count} Versuche
                      </p>
                      {item.last_error && (
                        <p className="text-[11px] text-danger-strong mt-1 break-words">{item.last_error}</p>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        type="button"
                        disabled={busy === item.id}
                        onClick={() => handleRetry(item)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-ios-md bg-claimondo-ondo hover:bg-claimondo-shield text-white text-[11px] disabled:opacity-50"
                      >
                        <RefreshCwIcon className="w-3 h-3" /> Erneut
                      </button>
                      <button
                        type="button"
                        disabled={busy === item.id}
                        onClick={() => handleDelete(item)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-ios-md border border-danger/30 text-danger-strong text-[11px] hover:bg-danger-soft disabled:opacity-50"
                      >
                        <Trash2Icon className="w-3 h-3" /> Verwerfen
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-5 py-3 border-t border-claimondo-border bg-claimondo-bg text-[11px] text-claimondo-ondo">
          Einträge, die nicht synchronisiert werden konnten, landen hier. Nach „Erneut versuchen" starten wir den Sync sofort.
        </div>
      </div>
    </Modal>
  )
}
