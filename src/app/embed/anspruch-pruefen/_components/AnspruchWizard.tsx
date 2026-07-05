'use client'
import { useEffect, useState } from 'react'
import { starteAnspruchSession } from '../actions'
import { AnspruchFotoStep } from './AnspruchFotoStep'
import { AnspruchEinschaetzungStep } from './AnspruchEinschaetzungStep'
import { AnspruchSummaryStep } from './AnspruchSummaryStep'
import type { AnspruchSpanne, VisionResult } from '@/lib/anspruch/types'
import { cn } from '@/lib/utils'

type Phase = 'foto' | 'einschaetzung' | 'summary'

const SCHRITTE: { key: Phase; label: string }[] = [
  { key: 'foto', label: 'Fotos' },
  { key: 'einschaetzung', label: 'Angaben' },
  { key: 'summary', label: 'Ergebnis' },
]

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

  const aktuellerIndex = SCHRITTE.findIndex((s) => s.key === phase)

  return (
    <div className="mx-auto max-w-md p-4">
      {/* Fortschritt: rahmt die drei Schritte als einen zusammenhaengenden Flow */}
      <div
        className="mb-6 flex gap-2"
        role="group"
        aria-label={`Schritt ${aktuellerIndex + 1} von ${SCHRITTE.length}: ${SCHRITTE[aktuellerIndex].label}`}
      >
        {SCHRITTE.map((s, i) => (
          <div key={s.key} className="flex-1">
            <div
              className={cn(
                'h-1 rounded-full transition-colors duration-200',
                i <= aktuellerIndex ? 'bg-claimondo-navy' : 'bg-claimondo-border',
              )}
            />
            <span
              className={cn(
                'mt-2 block text-center text-caption',
                i === aktuellerIndex
                  ? 'font-semibold text-claimondo-navy'
                  : i < aktuellerIndex
                    ? 'text-claimondo-navy'
                    : 'text-claimondo-shield',
              )}
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>

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
