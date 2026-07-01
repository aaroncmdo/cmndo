'use client'
import { useEffect, useState } from 'react'
import { starteAnspruchSession } from '../actions'
import { AnspruchFotoStep } from './AnspruchFotoStep'
import { AnspruchEinschaetzungStep } from './AnspruchEinschaetzungStep'
import { AnspruchSummaryStep } from './AnspruchSummaryStep'
import type { AnspruchSpanne, VisionResult } from '@/lib/anspruch/types'

type Phase = 'foto' | 'einschaetzung' | 'summary'

export function AnspruchWizard() {
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('foto')
  const [vision, setVision] = useState<VisionResult | null>(null)
  const [spanne, setSpanne] = useState<AnspruchSpanne | null>(null)

  useEffect(() => {
    let aktiv = true
    starteAnspruchSession().then((r) => { if (aktiv && r.ok) setSessionToken(r.sessionToken) })
    return () => { aktiv = false }
  }, [])

  if (!sessionToken) return <div className="p-6 text-center text-body-sm text-claimondo-shield">Wird geladen…</div>

  function zumFinder() {
    if (!sessionToken) return
    window.location.href = `/embed/gutachter-finder?schaetzung=${encodeURIComponent(sessionToken)}`
  }

  return (
    <div className="mx-auto max-w-md p-4">
      {phase === 'foto' && (
        <AnspruchFotoStep sessionToken={sessionToken} onWeiter={(v) => { setVision(v); setPhase('einschaetzung') }} />
      )}
      {phase === 'einschaetzung' && vision && (
        <AnspruchEinschaetzungStep sessionToken={sessionToken} vision={vision} onFertig={(s) => { setSpanne(s); setPhase('summary') }} />
      )}
      {phase === 'summary' && spanne && (
        <AnspruchSummaryStep spanne={spanne} onBeauftragen={zumFinder} />
      )}
    </div>
  )
}
