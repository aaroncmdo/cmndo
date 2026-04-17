'use client'

import { useEffect, useState } from 'react'
import { getPendingCount, getOutboxItems, type OutboxItem } from '@/lib/offline/outbox'
import { syncOutbox } from '@/lib/offline/sync-outbox'
import { CloudUploadIcon, XIcon, RefreshCwIcon, CheckCircleIcon, AlertCircleIcon, ClockIcon, AlertTriangleIcon } from 'lucide-react'

// KFZ-180: Badge das die Anzahl wartender Outbox-Uploads zeigt.
// Klick oeffnet Popup mit Liste + Retry.

export default function OutboxBadge() {
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<OutboxItem[]>([])
  const [syncing, setSyncing] = useState(false)

  // Poll count every 5s
  useEffect(() => {
    const poll = () => getPendingCount().then(setCount).catch(() => {})
    poll()
    const id = setInterval(poll, 5000)
    return () => clearInterval(id)
  }, [])

  // Load items when popup opens
  useEffect(() => {
    if (open) getOutboxItems().then(setItems).catch(() => {})
  }, [open, count])

  async function handleRetry() {
    setSyncing(true)
    await syncOutbox()
    const c = await getPendingCount()
    setCount(c)
    if (open) setItems(await getOutboxItems())
    setSyncing(false)
  }

  if (count === 0) return null

  const STATUS_ICON = {
    pending: <ClockIcon className="w-3.5 h-3.5 text-amber-500" />,
    uploading: <RefreshCwIcon className="w-3.5 h-3.5 text-blue-500 animate-spin" />,
    failed: <AlertCircleIcon className="w-3.5 h-3.5 text-red-500" />,
    // AAR-388: Dead-Letter — 10 Retries fehlgeschlagen
    dead: <AlertTriangleIcon className="w-3.5 h-3.5 text-red-700" />,
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
      >
        <CloudUploadIcon className="w-3.5 h-3.5" />
        {count} {count === 1 ? 'Foto wartet' : 'Fotos warten'}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl w-72 z-50">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-800">Upload-Warteschlange</span>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="max-h-48 overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">Keine Einträge</p>
            ) : (
              items.map(item => (
                <div key={item.id} className="px-3 py-2 border-b border-gray-50 flex items-center gap-2">
                  {STATUS_ICON[item.status]}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-800 truncate">{item.file_name}</p>
                    <p className="text-[10px] text-gray-400">{(item.file_size / 1024).toFixed(0)} KB — {item.dokument_typ}</p>
                  </div>
                  {item.status === 'failed' && (
                    <span className="text-[9px] text-red-500">{item.last_error?.slice(0, 30)}</span>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="px-3 py-2 border-t border-gray-100">
            <button
              onClick={handleRetry}
              disabled={syncing}
              className="w-full text-xs font-medium text-[#4573A2] hover:text-[#1E3A5F] disabled:text-gray-400 flex items-center justify-center gap-1.5 py-1"
            >
              <RefreshCwIcon className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Synchronisiere...' : 'Jetzt synchronisieren'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
