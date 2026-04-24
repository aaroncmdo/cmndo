'use client'

import { useTransition, useState } from 'react'
import { markAngerufen, markNichtErreicht } from './actions'
import { CheckIcon, XIcon } from 'lucide-react'

export default function RueckrufActions({
  leadId,
  anrufVersuche,
}: {
  leadId: string
  anrufVersuche: number
}) {
  const [pending, startTransition] = useTransition()
  const [toast, setToast] = useState('')

  function handle(fn: () => Promise<void>) {
    startTransition(async () => {
      try {
        await fn()
        setToast('OK')
        setTimeout(() => setToast(''), 1500)
      } catch (err) {
        setToast(err instanceof Error ? err.message : 'Fehler')
        setTimeout(() => setToast(''), 3000)
      }
    })
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      {toast && (
        <span className={`text-[10px] font-medium ${toast === 'OK' ? 'text-green-600' : 'text-red-600'}`}>{toast}</span>
      )}
      <button
        disabled={pending}
        onClick={() => handle(() => markAngerufen(leadId))}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
      >
        <CheckIcon className="w-3.5 h-3.5" />
        Angerufen
      </button>
      <button
        disabled={pending}
        onClick={() => handle(() => markNichtErreicht(leadId))}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-claimondo-border text-claimondo-ondo text-xs font-medium hover:bg-[#f8f9fb] transition-colors disabled:opacity-50"
      >
        <XIcon className="w-3.5 h-3.5" />
        Nicht erreicht
        {anrufVersuche >= 1 && <span className="text-[9px] text-red-500 ml-1">({anrufVersuche}/2)</span>}
      </button>
    </div>
  )
}
