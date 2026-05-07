'use client'

import { useTransition, useState } from 'react'
import { markRueckrufErledigtMitErgebnis } from './actions'
import { CheckCircle2Icon, PhoneIncomingIcon, PhoneOffIcon, XIcon } from 'lucide-react'

export default function RueckrufActions({
  leadId,
  anrufVersuche,
}: {
  leadId: string
  anrufVersuche: number
}) {
  const [pending, startTransition] = useTransition()
  const [offen, setOffen] = useState(false)
  const [ergebnis, setErgebnis] = useState<'erreicht' | 'nicht_erreicht'>('erreicht')
  const [notiz, setNotiz] = useState('')
  const [folgetermin, setFolgetermin] = useState('')
  const [toast, setToast] = useState('')

  function abschicken() {
    startTransition(async () => {
      const r = await markRueckrufErledigtMitErgebnis(
        leadId,
        ergebnis,
        notiz || null,
        ergebnis === 'nicht_erreicht' && folgetermin ? new Date(folgetermin).toISOString() : null,
      )
      if (r.ok) {
        setOffen(false)
        setNotiz('')
        setFolgetermin('')
        setToast('OK')
        setTimeout(() => setToast(''), 1500)
      } else {
        setToast(r.error ?? 'Fehler')
        setTimeout(() => setToast(''), 3000)
      }
    })
  }

  if (!offen) {
    return (
      <div className="flex items-center gap-2 shrink-0">
        {toast && (
          <span className={`text-[10px] font-medium ${toast === 'OK' ? 'text-emerald-600' : 'text-red-600'}`}>
            {toast}
          </span>
        )}
        <button
          disabled={pending}
          onClick={() => setOffen(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
        >
          <CheckCircle2Icon className="w-3.5 h-3.5" />
          Rückruf erledigt
          {anrufVersuche > 0 && (
            <span className="text-[9px] bg-white/20 px-1 rounded ml-0.5">
              {anrufVersuche}×
            </span>
          )}
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-claimondo-border bg-claimondo-bg p-3 space-y-2.5 w-72">
      {/* Ergebnis */}
      <div className="flex gap-2">
        <button
          onClick={() => setErgebnis('erreicht')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            ergebnis === 'erreicht'
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white text-claimondo-navy border-claimondo-border hover:bg-emerald-50'
          }`}
        >
          <PhoneIncomingIcon className="w-3 h-3" />
          Erreicht
        </button>
        <button
          onClick={() => setErgebnis('nicht_erreicht')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            ergebnis === 'nicht_erreicht'
              ? 'bg-red-600 text-white border-red-600'
              : 'bg-white text-claimondo-navy border-claimondo-border hover:bg-red-50'
          }`}
        >
          <PhoneOffIcon className="w-3 h-3" />
          Nicht erreicht
        </button>
      </div>

      {/* Notiz */}
      <input
        type="text"
        value={notiz}
        onChange={(e) => setNotiz(e.target.value)}
        placeholder="Kurze Notiz zum Gespräch …"
        className="w-full bg-white border border-claimondo-border text-claimondo-navy text-[11px] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-claimondo-ondo placeholder-claimondo-ondo/40"
      />

      {/* Folgetermin */}
      {ergebnis === 'nicht_erreicht' && (
        <input
          type="datetime-local"
          value={folgetermin}
          onChange={(e) => setFolgetermin(e.target.value)}
          title="Nächsten Rückruf planen (optional)"
          className="w-full bg-white border border-claimondo-border text-claimondo-navy text-[11px] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-claimondo-ondo"
        />
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={abschicken}
          disabled={pending}
          className="px-3 py-1.5 rounded-lg bg-claimondo-ondo hover:bg-claimondo-navy text-white text-[11px] font-medium disabled:opacity-50 transition-colors"
        >
          {pending ? '…' : 'Speichern'}
        </button>
        <button
          onClick={() => { setOffen(false); setNotiz(''); setFolgetermin('') }}
          disabled={pending}
          className="p-1.5 rounded-lg border border-claimondo-border text-claimondo-navy hover:bg-white disabled:opacity-50 transition-colors"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
        {toast && toast !== 'OK' && (
          <span className="text-[10px] text-red-600">{toast}</span>
        )}
      </div>
    </div>
  )
}
