'use client'

// AAR-542 (C5): Admin-Debug-Modal pro Pflicht-Matrix-Slot.
// AAR-781: Migriert auf Modal-Primitive (ESC-Handling durch Modal übernommen).

import { AlertTriangleIcon, XIcon } from 'lucide-react'
import type { PflichtDocMatrixEntry } from '@/lib/dokumente/pflicht-evaluator'
import { Modal } from '@/components/primitives'

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
  if (!entry) return null

  const status = !entry.freigeschaltet
    ? { label: 'Nicht freigeschaltet', color: 'bg-claimondo-bg text-claimondo-ondo border-claimondo-border' }
    : entry.pflicht
      ? { label: 'Pflicht', color: 'bg-claimondo-ondo/10 text-claimondo-navy border-claimondo-ondo/30' }
      : { label: 'Optional', color: 'bg-claimondo-bg text-claimondo-ondo border-claimondo-border' }

  return (
    <Modal open onClose={onClose} maxWidth={512} noPadding hideCloseButton ariaLabel="Regel-Debug">
      <div className="flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 64px)' }}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-claimondo-border">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 mb-1">
              Slot · {entry.kategorie}
            </p>
            <h3 className="text-base font-semibold text-claimondo-navy truncate">{entry.label}</h3>
            <p className="text-[11px] text-claimondo-ondo mt-0.5 truncate">
              slot_id: <code className="font-mono">{entry.slot_id}</code>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-claimondo-ondo/70 hover:text-claimondo-ondo shrink-0"
            aria-label="Schließen"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] font-medium border rounded-full px-2.5 py-0.5 ${status.color}`}>
              {status.label}
            </span>
            <span className="text-[11px] text-claimondo-ondo">{entry.regel_erklaerung}</span>
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
            <p className="text-[10px] font-semibold uppercase tracking-wider text-claimondo-ondo mb-1">
              freigeschaltet_wenn
            </p>
            <pre className="bg-claimondo-bg border border-claimondo-border rounded-lg px-3 py-2 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
              {pretty(entry.freigeschaltet_wenn)}
            </pre>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-claimondo-ondo mb-1">
              pflicht_wenn
            </p>
            <pre className="bg-claimondo-bg border border-claimondo-border rounded-lg px-3 py-2 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
              {pretty(entry.pflicht_wenn)}
            </pre>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[11px]">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-claimondo-ondo mb-1">Freigeschaltet?</p>
              <p className="text-claimondo-navy">{entry.freigeschaltet ? 'Ja' : 'Nein'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-claimondo-ondo mb-1">Pflicht?</p>
              <p className="text-claimondo-navy">{entry.pflicht ? 'Ja' : 'Nein'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-claimondo-ondo mb-1">DB-Status</p>
              <p className="text-claimondo-navy">{entry.status}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-claimondo-ondo mb-1">DB-Row</p>
              <p className="text-claimondo-navy">
                {entry.pflicht_row_id ? (
                  <code className="font-mono text-[10px]">{entry.pflicht_row_id}</code>
                ) : '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-claimondo-border flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-claimondo-ondo text-white hover:bg-claimondo-navy"
          >
            Schließen
          </button>
        </div>
      </div>
    </Modal>
  )
}
