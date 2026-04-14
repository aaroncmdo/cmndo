'use client'

// AAR-84: Cardentity-Anreicherungs-Button fuer Dispatch
import { useState, useTransition } from 'react'
import { SparklesIcon, CheckIcon, AlertCircleIcon } from 'lucide-react'
import { enrichLeadCardentity } from './actions'

export default function CardentityButton({ leadId, hasFin, alreadyEnriched }: {
  leadId: string
  hasFin: boolean
  alreadyEnriched: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  if (!hasFin) {
    return <p className="text-xs text-gray-400 italic">Cardentity-Anreicherung: keine FIN vorhanden</p>
  }
  if (alreadyEnriched) {
    return (
      <p className="text-xs text-emerald-600 flex items-center gap-1">
        <CheckIcon className="w-3 h-3" /> Cardentity-Daten geladen
      </p>
    )
  }

  function handleClick() {
    setMsg(null)
    startTransition(async () => {
      const result = await enrichLeadCardentity(leadId)
      if (result.success) {
        setMsg({ ok: true, text: `Anreicherung OK (${result.updatedFields?.length ?? 0} Felder)` })
      } else {
        setMsg({ ok: false, text: result.error ?? 'Fehler' })
      }
    })
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-50"
      >
        <SparklesIcon className="w-3.5 h-3.5" />
        {pending ? 'Lade...' : 'Cardentity anreichern'}
      </button>
      {msg && (
        <p className={`text-xs flex items-center gap-1 ${msg.ok ? 'text-emerald-600' : 'text-red-500'}`}>
          {msg.ok ? <CheckIcon className="w-3 h-3" /> : <AlertCircleIcon className="w-3 h-3" />}
          {msg.text}
        </p>
      )}
    </div>
  )
}
