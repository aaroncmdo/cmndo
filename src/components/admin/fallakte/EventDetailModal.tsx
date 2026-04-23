'use client'

// AAR-544 (C7): Detail-Modal für einen einzelnen Timeline-Event.
// Zeigt alle Metadaten als JSON + Actor + Timestamps + optionaler Route-Link.

import { XIcon, ExternalLinkIcon } from 'lucide-react'
import Link from 'next/link'
import type { FallEvent } from '@/lib/fall/event-stream'

export function EventDetailModal({
  event,
  onClose,
}: {
  event: FallEvent | null
  onClose: () => void
}) {
  if (!event) return null

  const ts = new Date(event.timestamp)
  const tsLabel = isNaN(ts.getTime())
    ? event.timestamp
    : ts.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="glass-light border border-claimondo-border rounded-ios-lg shadow-ios-lg max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-200">
          <div className="min-w-0">
            <p className="text-xs text-gray-500 mb-0.5">
              {event.source} · {event.kategorie}
            </p>
            <h3 className="text-base font-semibold text-[#0D1B3E]">{event.titel}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{tsLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-100 text-gray-500"
            aria-label="Schließen"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto space-y-3">
          {event.beschreibung && (
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{event.beschreibung}</p>
          )}
          {event.actor && (
            <div className="text-xs text-gray-600">
              <span className="font-medium text-[#0D1B3E]">Ausgelöst von: </span>
              {event.actor.name ?? event.actor.id ?? '—'}
              {event.actor.rolle && ` (${event.actor.rolle})`}
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-[#0D1B3E] mb-1">Typ</p>
            <code className="text-xs text-gray-700 bg-gray-50 rounded px-1.5 py-0.5">
              {event.typ}
            </code>
          </div>
          {event.metadata && Object.keys(event.metadata).length > 0 && (
            <div>
              <p className="text-xs font-medium text-[#0D1B3E] mb-1">Metadaten</p>
              <pre className="text-[11px] text-gray-700 bg-[#f8f9fb] border border-gray-200 rounded p-2 overflow-x-auto">
                {JSON.stringify(event.metadata, null, 2)}
              </pre>
            </div>
          )}
          {event.route_url && (
            <Link
              href={event.route_url}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#4573A2] hover:underline"
            >
              Zum Ziel
              <ExternalLinkIcon className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
