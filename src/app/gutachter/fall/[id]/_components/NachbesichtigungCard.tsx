'use client'

// AAR-294 / AAR-398: Conditional NachbesichtigungCard. DB-Felder verifiziert:
// nachbesichtigung_status, _angefordert_am, _termin_datum, _ergebnis.
// Self-Gating über Whitelist aktiver States — robust gegen DB-Drift
// (vorheriger Blacklist-Check hat 'nicht_angefordert' (Underscore) ≠
// 'nicht-angefordert' (Bindestrich) nicht gefangen).

import { RefreshCwIcon, ClockIcon, CheckCircle2Icon, CalendarIcon } from 'lucide-react'
import { tageSeit } from '@/lib/gutachter/abrechnung'

type Fall = {
  id: string
  nachbesichtigung_status?: string | null
  nachbesichtigung_angefordert_am?: string | null
  nachbesichtigung_termin_datum?: string | null
  nachbesichtigung_ergebnis?: string | null
}

const AKTIVE_STATES = new Set([
  'angefordert',
  'termin-gewaehlt',
  'durchgefuehrt',
  'ergebnis-eingegangen',
])

export function NachbesichtigungCard({ fall, id }: { fall: Fall; id?: string }) {
  const status = fall.nachbesichtigung_status
  if (!status || !AKTIVE_STATES.has(status)) return null

  const durchgefuehrt =
    status === 'durchgefuehrt' ||
    status === 'ergebnis-eingegangen' ||
    Boolean(fall.nachbesichtigung_ergebnis)
  const terminSet = Boolean(fall.nachbesichtigung_termin_datum)
  const tage = tageSeit(fall.nachbesichtigung_angefordert_am)

  return (
    <div
      id={id}
      className={`rounded-2xl border p-4 sm:p-5 space-y-3 ${
        durchgefuehrt
          ? 'bg-emerald-50 border-emerald-200'
          : 'bg-[#f8f9fb] border-claimondo-border'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCwIcon
            className={`w-4 h-4 ${
              durchgefuehrt ? 'text-emerald-600' : 'text-claimondo-ondo'
            }`}
          />
          <p className="text-xs uppercase tracking-wider font-semibold">
            Nachbesichtigung
          </p>
        </div>
        {tage != null && !durchgefuehrt && (
          <span className="inline-flex items-center gap-1 text-[11px] text-claimondo-ondo">
            <ClockIcon className="w-3 h-3" />
            seit {tage} {tage === 1 ? 'Tag' : 'Tagen'}
          </span>
        )}
      </div>

      {durchgefuehrt ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-emerald-800">
            <CheckCircle2Icon className="w-4 h-4" />
            Durchgeführt
          </div>
          {fall.nachbesichtigung_ergebnis && (
            <p className="text-xs text-claimondo-navy bg-white rounded-lg px-3 py-2 border border-emerald-100">
              {fall.nachbesichtigung_ergebnis}
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-claimondo-navy">
            Eine Nachbesichtigung wurde angefordert.
          </p>
          {terminSet && (
            <div className="flex items-center gap-2 text-xs text-claimondo-navy bg-white rounded-lg px-3 py-2 border border-blue-100">
              <CalendarIcon className="w-3 h-3 text-claimondo-ondo" />
              Termin:{' '}
              {new Date(fall.nachbesichtigung_termin_datum!).toLocaleString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          )}
          <p className="text-xs text-claimondo-ondo">
            {terminSet
              ? 'Den Termin bitte wie vereinbart durchführen. Dokumentiere das Ergebnis im Chat.'
              : 'Bitte mit dem Kunden einen Termin vereinbaren (Chat) und danach das Ergebnis dokumentieren.'}
          </p>
        </>
      )}
    </div>
  )
}
