'use client'

// Geteilter Rückruf-Erledigen-Flow: "Rückruf erledigt"-Trigger -> Ergebnis
// (erreicht/nicht erreicht) + Notiz + optionaler Folgetermin -> onSubmit.
// Vorher 2x verbatim dupliziert: RueckrufTerminPanel (Panel-Variante, textarea)
// und dispatch/rueckrufe/RueckrufActions (Compact-Variante, inline in der Liste).
// State + Submit-Logik leben jetzt EINMAL hier; die konkrete Action (lead- vs
// fall-scoped) wird per onSubmit reingereicht, Styling per variant.

import { useState, useTransition } from 'react'
import { CheckCircle2Icon, PhoneIncomingIcon, PhoneOffIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/primitives/Button/Button.web'

export type RueckrufErgebnis = 'erreicht' | 'nicht_erreicht'

export function RueckrufErledigenForm({
  onSubmit,
  onDone,
  anrufVersuche = 0,
  variant = 'panel',
}: {
  /** Wird mit dem Ergebnis + Notiz + (bei 'nicht_erreicht') optionalem Folgetermin-ISO
   *  aufgerufen. Der Caller verdrahtet die konkrete Action (z.B. markRueckrufErledigtMitErgebnis). */
  onSubmit: (
    ergebnis: RueckrufErgebnis,
    notiz: string | null,
    folgeterminIso: string | null,
  ) => Promise<{ ok: boolean; error?: string }>
  /** Nach erfolgreichem Submit; erhält das Ergebnis, damit der Caller z.B. bei 'erreicht'
   *  ein Modal schließen bzw. neu laden kann. */
  onDone?: (ergebnis: RueckrufErgebnis) => void
  /** Anzahl bisheriger Anrufversuche — nur für die Badge-Anzeige. */
  anrufVersuche?: number
  /** 'panel' = textarea + Labels (Detail-Panel); 'compact' = input + w-72 (Listen-Zeile). */
  variant?: 'panel' | 'compact'
}) {
  const [pending, startTransition] = useTransition()
  const [offen, setOffen] = useState(false)
  const [ergebnis, setErgebnis] = useState<RueckrufErgebnis>('erreicht')
  const [notiz, setNotiz] = useState('')
  const [folgetermin, setFolgetermin] = useState('')
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null)

  const compact = variant === 'compact'

  function reset() {
    setOffen(false)
    setNotiz('')
    setFolgetermin('')
  }

  function abschicken() {
    startTransition(async () => {
      const r = await onSubmit(
        ergebnis,
        notiz || null,
        ergebnis === 'nicht_erreicht' && folgetermin ? new Date(folgetermin).toISOString() : null,
      )
      if (r.ok) {
        reset()
        setToast({ ok: true, text: 'Erledigt' })
        setTimeout(() => setToast(null), 1500)
        onDone?.(ergebnis)
      } else {
        setToast({ ok: false, text: r.error ?? 'Fehler' })
        setTimeout(() => setToast(null), 3000)
      }
    })
  }

  if (!offen) {
    return (
      <div className="flex items-center gap-2 shrink-0">
        {toast && (
          <span className={`text-[10px] font-medium ${toast.ok ? 'text-success' : 'text-danger'}`}>
            {toast.ok ? '✓' : toast.text}
          </span>
        )}
        <Button
          variant="success"
          size="sm"
          disabled={pending}
          onClick={() => setOffen(true)}
          iconLeft={<CheckCircle2Icon className="w-3.5 h-3.5" />}
        >
          Rückruf erledigt
          {anrufVersuche > 0 && (
            <span className="text-[9px] bg-white/20 px-1 rounded ml-0.5">{anrufVersuche}×</span>
          )}
        </Button>
      </div>
    )
  }

  const toggleBtn = (wert: RueckrufErgebnis, Icon: typeof PhoneIncomingIcon, label: string, aktivCls: string, hoverCls: string) => (
    <button
      onClick={() => setErgebnis(wert)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-ios-lg text-xs font-medium border transition-colors ${
        ergebnis === wert ? aktivCls : `bg-white text-claimondo-navy border-claimondo-border ${hoverCls}`
      }`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  )

  return (
    <div className={`rounded-ios-xl border border-claimondo-border bg-claimondo-bg p-3 ${compact ? 'space-y-2.5 w-full sm:w-72' : 'space-y-3'}`}>
      {/* Ergebnis */}
      <div>
        {!compact && <p className="text-[11px] font-medium text-claimondo-ondo mb-1.5">Ergebnis</p>}
        <div className="flex gap-2">
          {toggleBtn('erreicht', PhoneIncomingIcon, 'Erreicht', 'bg-success text-white border-success', 'hover:bg-success-soft')}
          {toggleBtn('nicht_erreicht', PhoneOffIcon, 'Nicht erreicht', 'bg-danger text-white border-danger', 'hover:bg-danger-soft')}
        </div>
      </div>

      {/* Notiz */}
      <div>
        {!compact && (
          <label className="text-[11px] font-medium text-claimondo-ondo block mb-1">
            Notiz (Gesprächsinhalt / Ergebnis)
          </label>
        )}
        {compact ? (
          <input
            type="text"
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            placeholder="Kurze Notiz zum Gespräch …"
            className="w-full bg-white border border-claimondo-border text-claimondo-navy text-[11px] rounded-ios-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-claimondo-ondo placeholder-claimondo-ondo/40"
          />
        ) : (
          <textarea
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            rows={2}
            placeholder="z.B. Kunde bestätigt Termin am Freitag …"
            className="w-full bg-white border border-claimondo-border text-claimondo-navy text-xs rounded-ios-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-claimondo-ondo placeholder-claimondo-ondo/40 resize-none"
          />
        )}
      </div>

      {/* Folgetermin — nur wenn nicht erreicht */}
      {ergebnis === 'nicht_erreicht' && (
        <div>
          {!compact && (
            <label className="text-[11px] font-medium text-claimondo-ondo block mb-1">
              Nächsten Rückruf planen (optional)
            </label>
          )}
          <input
            type="datetime-local"
            value={folgetermin}
            onChange={(e) => setFolgetermin(e.target.value)}
            title="Nächsten Rückruf planen (optional)"
            className={`w-full bg-white border border-claimondo-border text-claimondo-navy rounded-ios-lg focus:outline-none focus:ring-1 focus:ring-claimondo-ondo ${compact ? 'text-[11px] px-2.5 py-1.5' : 'text-xs px-2.5 py-2'}`}
          />
        </div>
      )}

      {/* Aktionen */}
      <div className="flex items-center gap-2">
        <Button variant="ondo" size="sm" onClick={abschicken} disabled={pending}>
          {pending ? (compact ? '…' : 'Speichert …') : 'Speichern'}
        </Button>
        {compact ? (
          <button
            onClick={reset}
            disabled={pending}
            className="p-1.5 rounded-ios-lg border border-claimondo-border text-claimondo-navy hover:bg-white disabled:opacity-50 transition-colors"
            aria-label="Abbrechen"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        ) : (
          <Button variant="ghost" size="sm" onClick={reset} disabled={pending}>
            Abbrechen
          </Button>
        )}
        {toast && !toast.ok && <span className="text-[10px] text-danger">{toast.text}</span>}
        {compact && anrufVersuche >= 1 && (
          <span className="text-[9px] text-danger ml-1">({anrufVersuche}/2)</span>
        )}
      </div>
    </div>
  )
}
