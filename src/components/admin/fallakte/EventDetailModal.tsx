'use client'

// AAR-544 (C7): Detail-Modal für einen einzelnen Timeline-Event.
// AAR-781: Migriert auf Modal-Primitive.

import { XIcon, ExternalLinkIcon } from 'lucide-react'
import Link from 'next/link'
import type { FallEvent } from '@/lib/fall/event-stream'
import { Modal } from '@/components/primitives'

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
    : ts.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' })

  return (
    <Modal open onClose={onClose} maxWidth={512} noPadding hideCloseButton ariaLabel="Event-Details">
      <div className="flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 64px)' }}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-claimondo-border">
          <div className="min-w-0">
            <p className="text-xs text-claimondo-ondo mb-0.5">
              {event.source} · {event.kategorie}
            </p>
            <h3 className="text-base font-semibold text-claimondo-navy">{event.titel}</h3>
            <p className="text-xs text-claimondo-ondo mt-0.5">{tsLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-claimondo-bg text-claimondo-ondo"
            aria-label="Schließen"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-3">
          {event.beschreibung && (
            <p className="text-sm text-claimondo-navy whitespace-pre-wrap">{event.beschreibung}</p>
          )}
          {event.actor && (
            <div className="text-xs text-claimondo-ondo">
              <span className="font-medium text-claimondo-navy">Ausgelöst von: </span>
              {event.actor.name ?? event.actor.id ?? '—'}
              {event.actor.rolle && ` (${event.actor.rolle})`}
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-claimondo-navy mb-1">Typ</p>
            <code className="text-xs text-claimondo-navy bg-claimondo-bg rounded px-1.5 py-0.5">
              {event.typ}
            </code>
          </div>
          {event.metadata && Object.keys(event.metadata).length > 0 && (
            <div>
              <p className="text-xs font-medium text-claimondo-navy mb-1">Metadaten</p>
              <pre className="text-[11px] text-claimondo-navy bg-claimondo-bg border border-claimondo-border rounded p-2 overflow-x-auto">
                {JSON.stringify(event.metadata, null, 2)}
              </pre>
            </div>
          )}
          {event.route_url && (
            <Link
              href={event.route_url}
              className="inline-flex items-center gap-1 text-xs font-medium text-claimondo-ondo hover:underline"
            >
              Zum Ziel
              <ExternalLinkIcon className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>
    </Modal>
  )
}
