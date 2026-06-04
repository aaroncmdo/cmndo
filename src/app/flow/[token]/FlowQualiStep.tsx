'use client'

// AAR-956 §3a: Quali-Step im /flow (termin-loser Lead). Reuse QualiOptionen +
// lead-gekeyte speichereQualiFlow. Eigenverschulden → Kasko-Endansicht (kein Termin);
// sonst → onWeiter (Wizard advanced zum Slot-Step).

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { QualiOptionen } from '@/components/self-service/QualiOptionen'
import { KaskoEndansicht } from '@/components/self-service/KaskoEndansicht'
import { speichereQualiFlow } from './self-service-actions'

export function FlowQualiStep({
  token,
  vorname,
  onWeiter,
}: {
  token: string
  vorname: string | null
  onWeiter: () => void
}) {
  const t = useTranslations('selfService')
  const [phase, setPhase] = useState<'frage' | 'sende' | 'abbruch' | 'fehler'>('frage')
  const [fehler, setFehler] = useState<string | null>(null)

  async function waehle(value: string) {
    setPhase('sende')
    setFehler(null)
    try {
      const r = await speichereQualiFlow(token, value)
      if (!r.ok) {
        setPhase('fehler')
        setFehler(r.error ?? t('errors.allgemein'))
        return
      }
      if (r.ergebnis === 'abbruch') {
        setPhase('abbruch')
        return
      }
      onWeiter()
    } catch {
      setPhase('fehler')
      setFehler(t('errors.unerwartet'))
    }
  }

  if (phase === 'abbruch') return <KaskoEndansicht />
  if (phase === 'fehler') {
    return (
      <div className="max-w-md text-center">
        <p className="text-claimondo-navy/70">{fehler}</p>
      </div>
    )
  }
  return <QualiOptionen vorname={vorname} disabled={phase === 'sende'} onWaehle={waehle} />
}
