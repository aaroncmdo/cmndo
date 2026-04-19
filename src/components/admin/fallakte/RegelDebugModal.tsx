'use client'

// AAR-542 (C5): Admin-Debug-Modal pro Pflicht-Matrix-Slot.
// Zeigt die JSON-Regeln + Erklärung + aktuelle Evaluation — hilft dem Admin
// „warum ist das hier Pflicht?" in Sekunden zu beantworten.

import { useEffect } from 'react'
import { XIcon, AlertTriangleIcon } from 'lucide-react'
import type { PflichtDocMatrixEntry } from '@/lib/dokumente/pflicht-evaluator'

function pretty(obj: unknown): string {
  if (obj == null) return '(keine Regel)'
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(obj)
  }
}

export default function RegelDebugModal({
  entry,
  onClose,
}: {
  entry: PflichtDocMatrixEntry | null
  onClose: () => void
}) {
  useEffect(() => {
    if (!entry) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [entry, onClose])

  if (!entry) return null

  const status = !entry.freigeschaltet
    ? { label: 'Nicht freigeschaltet', color: 'bg-gray-50 text-gray-500 border-gray-200' }
    : entry.pflicht
      ? { label: 'Pflicht', color: 'bg-[#4573A2]/10 text-[#0D1B3E] border-[#4573A2]/30' }
      : { label: 'Optional', color: 'bg-gray-50 text-gray-600 border-gray-200' }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">
              Slot · {entry.kategorie}
            </p>
            <h3 className="text-base font-semibold text-[#0D1B3E] truncate">{entry.label}</h3>
            <p className="text-[11px] text-gray-500 mt-0.5 truncate">
              slot_id: <code className="font-mono">{entry.slot_id}</code>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 shrink-0"
            aria-label="Schließen"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-[11px] font-medium border rounded-full px-2.5 py-0.5 ${status.color}`}
            >
              {status.label}
            </span>
            <span className="text-[11px] text-gray-500">{entry.regel_erklaerung}</span>
          </div>

          {entry.inkonsistenz && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex items-start gap-2">
              <AlertTriangleIcon className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-900">
                {entry.inkonsistenz === 'db_pflicht_ohne_regel'
                  ? 'DB-Row steht auf pflicht=true, aber die Katalog-Regel sagt nicht Pflicht. Vermutlich manuell geändert.'
                  : 'Katalog-Regel sagt Pflicht, aber es existiert noch keine pflichtdokumente-Zeile. Wird beim nächsten Re-Evaluate angelegt.'}
              </p>
            </div>
          )}

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
              freigeschaltet_wenn
            </p>
            <pre className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
              {pretty(entry.freigeschaltet_wenn)}
            </pre>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
              pflicht_wenn
            </p>
            <pre className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
              {pretty(entry.pflicht_wenn)}
            </pre>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[11px]">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                Freigeschaltet?
              </p>
              <p className="text-gray-800">{entry.freigeschaltet ? 'Ja' : 'Nein'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                Pflicht?
              </p>
              <p className="text-gray-800">{entry.pflicht ? 'Ja' : 'Nein'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                DB-Status
              </p>
              <p className="text-gray-800">{entry.status}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                DB-Row
              </p>
              <p className="text-gray-800">
                {entry.pflicht_row_id ? (
                  <code className="font-mono text-[10px]">{entry.pflicht_row_id}</code>
                ) : (
                  '—'
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-[#4573A2] text-white hover:bg-[#0D1B3E]"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  )
}
