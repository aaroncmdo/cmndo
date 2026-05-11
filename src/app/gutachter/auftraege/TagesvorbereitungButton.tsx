'use client'

// CMM-37 (Vorab Option A): Button auf der Aufträge-Liste der den
// Tagesvorbereitungs-CSV-Export auslöst. Default-Range = heute, mit
// kleinem Datums-Picker für die nächsten 7 Tage.

import { useState, useTransition } from 'react'
import { DownloadIcon, Loader2Icon } from 'lucide-react'
import { exportTagesvorbereitung } from './export-action'

export default function TagesvorbereitungButton() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [tag, setTag] = useState<string>(() => {
    const d = new Date()
    return d.toISOString().slice(0, 10)
  })

  function trigger() {
    setError(null)
    startTransition(async () => {
      const result = await exportTagesvorbereitung({ von: tag, bis: tag })
      if (!result.ok) {
        setError(result.error)
        return
      }
      const blob = new Blob([result.csv], {
        type: 'text/csv;charset=utf-8',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = result.filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    })
  }

  return (
    <div className="inline-flex items-center gap-2">
      <input
        type="date"
        value={tag}
        onChange={(e) => setTag(e.target.value)}
        className="h-9 px-2 rounded-lg border border-claimondo-border text-xs text-claimondo-navy bg-white"
        disabled={pending}
      />
      <button
        type="button"
        onClick={trigger}
        disabled={pending}
        className={`h-9 inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium border border-claimondo-border bg-white text-claimondo-navy hover:bg-claimondo-bg transition-colors ${
          pending ? 'opacity-60 pointer-events-none' : ''
        }`}
      >
        {pending ? (
          <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <DownloadIcon className="w-3.5 h-3.5" />
        )}
        Tagesvorbereitung CSV
      </button>
      {error && (
        <span className="text-xs text-rose-700">{error}</span>
      )}
    </div>
  )
}
