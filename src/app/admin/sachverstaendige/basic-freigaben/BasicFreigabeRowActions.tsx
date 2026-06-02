'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2Icon, XCircleIcon, Loader2Icon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { gibBasicSvFrei, lehneBasicSvAb } from '../[id]/verifizierung-actions'

export default function BasicFreigabeRowActions({ svId }: { svId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [showAblehnen, setShowAblehnen] = useState(false)
  const [ablehnGrund, setAblehnGrund] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)

  function handleFreigeben() {
    if (!confirm('Profil freischalten? Setzt verifiziert + ist_aktiv + portal_zugang_freigeschaltet.')) return
    setFehler(null)
    startTransition(async () => {
      const res = await gibBasicSvFrei(svId)
      if (!res.success) {
        setFehler(res.error ?? 'Freigabe fehlgeschlagen')
        toast.error('Freigabe fehlgeschlagen', { description: res.error })
        return
      }
      toast.success('Profil freigeschaltet')
      router.refresh()
    })
  }

  function handleAblehnen() {
    const grund = ablehnGrund.trim()
    if (grund.length < 10) {
      setFehler('Mind. 10 Zeichen erforderlich.')
      return
    }
    setFehler(null)
    startTransition(async () => {
      const res = await lehneBasicSvAb(svId, grund)
      if (!res.success) {
        setFehler(res.error ?? 'Ablehnung fehlgeschlagen')
        toast.error('Ablehnung fehlgeschlagen', { description: res.error })
        return
      }
      toast.success('Profil abgelehnt')
      setShowAblehnen(false)
      setAblehnGrund('')
      router.refresh()
    })
  }

  if (showAblehnen) {
    return (
      <div className="space-y-1.5 min-w-[220px]">
        <textarea
          value={ablehnGrund}
          onChange={e => setAblehnGrund(e.target.value)}
          placeholder="Ablehnungsgrund (mind. 10 Zeichen)"
          rows={2}
          className="w-full text-[11px] px-2 py-1.5 border border-claimondo-border rounded-ios-md focus:outline-none focus:border-red-400 resize-none"
          autoFocus
        />
        {fehler && <p className="text-[10px] text-red-700">{fehler}</p>}
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={handleAblehnen}
            disabled={pending || ablehnGrund.trim().length < 10}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-ios-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
          >
            {pending ? <Loader2Icon className="w-3 h-3 animate-spin" /> : null}
            Bestätigen
          </button>
          <button
            type="button"
            onClick={() => { setShowAblehnen(false); setAblehnGrund(''); setFehler(null) }}
            disabled={pending}
            className="px-2.5 py-1 text-[11px] rounded-ios-md border border-claimondo-border text-claimondo-ondo hover:bg-claimondo-bg"
          >
            Abbrechen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={handleFreigeben}
        disabled={pending}
        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-ios-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 font-medium"
      >
        {pending ? (
          <Loader2Icon className="w-3 h-3 animate-spin" />
        ) : (
          <CheckCircle2Icon className="w-3 h-3" />
        )}
        Freigeben
      </button>
      <button
        type="button"
        onClick={() => setShowAblehnen(true)}
        disabled={pending}
        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-ios-md border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-40 font-medium"
      >
        <XCircleIcon className="w-3 h-3" />
        Ablehnen
      </button>
      {fehler && <p className="text-[10px] text-red-700">{fehler}</p>}
    </div>
  )
}
