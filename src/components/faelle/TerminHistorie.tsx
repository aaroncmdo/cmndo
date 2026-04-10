'use client'

import { CalendarIcon, CheckCircleIcon, XCircleIcon, RefreshCwIcon, ClockIcon } from 'lucide-react'

// KFZ-134: Termin-Pingpong-Historie in der Fall-Detail Right-Sidebar.

type TerminHistorieRow = {
  id: string
  start_zeit: string
  status: string
  vorgeschlagenes_datum: string | null
  gegenvorschlag_von: string | null
  gegenvorschlag_grund: string | null
  abgelehnt_grund: string | null
  created_at: string
}

const STATUS_ICON: Record<string, { Icon: typeof CalendarIcon; cls: string; label: string }> = {
  reserviert: { Icon: ClockIcon, cls: 'text-blue-500', label: 'Reserviert' },
  vorschlag: { Icon: CalendarIcon, cls: 'text-amber-500', label: 'Vorgeschlagen' },
  gegenvorschlag: { Icon: RefreshCwIcon, cls: 'text-orange-500', label: 'Gegenvorschlag' },
  bestaetigt: { Icon: CheckCircleIcon, cls: 'text-emerald-500', label: 'Bestätigt' },
  abgelehnt: { Icon: XCircleIcon, cls: 'text-red-500', label: 'Abgelehnt' },
  storniert: { Icon: XCircleIcon, cls: 'text-gray-400', label: 'Storniert' },
}

function formatKurz(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function TerminHistorie({ termine }: { termine: TerminHistorieRow[] }) {
  if (termine.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
        Termin-Verlauf
      </h3>
      <div className="space-y-1.5">
        {termine.map(t => {
          const cfg = STATUS_ICON[t.status] ?? STATUS_ICON.reserviert
          const Icon = cfg.Icon
          const displayDatum = t.vorgeschlagenes_datum && t.status === 'gegenvorschlag'
            ? t.vorgeschlagenes_datum
            : t.start_zeit
          return (
            <div key={t.id} className="flex items-start gap-2 px-1 py-1">
              <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${cfg.cls}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-gray-800 font-medium">{cfg.label}</span>
                  <span className="text-[10px] text-gray-400">{formatKurz(displayDatum)}</span>
                </div>
                {t.gegenvorschlag_von && (
                  <p className="text-[9px] text-gray-500">von {t.gegenvorschlag_von === 'sv' ? 'Gutachter' : 'Kunde'}</p>
                )}
                {t.gegenvorschlag_grund && (
                  <p className="text-[9px] text-amber-600">{t.gegenvorschlag_grund}</p>
                )}
                {t.abgelehnt_grund && (
                  <p className="text-[9px] text-red-600">{t.abgelehnt_grund}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
