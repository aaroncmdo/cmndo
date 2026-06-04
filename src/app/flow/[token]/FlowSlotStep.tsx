'use client'

// AAR-956 §3a: Slot-Step im /flow (termin-loser Lead). Reuse SvSlotAuswahl +
// lead-gekeytes ladeMatchingFlow/bucheTerminFlow. NUR Match + Reservierung — KEIN
// SA/account (das macht /flow's eigener Pfad). Bei Erfolg → onGebucht (Wizard hebt
// die Auswahl + advanced zum gutachter-Step). Kein-Match/Standort-fehlt = Rückruf.

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { SvSlotAuswahl } from '@/components/self-service/SvSlotAuswahl'
import { ladeMatchingFlow, bucheTerminFlow } from './self-service-actions'
import type { OeffentlichesSvProfil, SlotVorschlag } from '@/lib/sv-matching-modul/types'

export type GebuchterTermin = { svVorname: string; svAvatar: string | null; startIso: string }

export function FlowSlotStep({
  token,
  onGebucht,
}: {
  token: string
  onGebucht: (t: GebuchterTermin) => void
}) {
  const t = useTranslations('selfService')
  const [step, setStep] = useState<'laden' | 'auswahl' | 'absenden' | 'fehler' | 'kein_match'>('laden')
  const [svs, setSvs] = useState<OeffentlichesSvProfil[]>([])
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    let ab = false
    ladeMatchingFlow(token)
      .then((r) => {
        if (ab) return
        if (!r.ok) {
          setFehler(r.error ?? null)
          // AAR-956 §4: typsicher statt error-String-Sniffing — ortFehlt kommt aus
          // dem Resolver (Task 3 ersetzt 'kein_match' hier durch eine Adress-Abfrage).
          setStep(r.ortFehlt ? 'kein_match' : 'fehler')
          return
        }
        const list = r.svs ?? []
        if (list.length === 0 || list.every((sv) => sv.slots.length === 0)) {
          setStep('kein_match')
          return
        }
        setSvs(list)
        setStep('auswahl')
      })
      .catch(() => {
        if (!ab) {
          setStep('fehler')
          setFehler(t('matching.laden_fehler'))
        }
      })
    return () => {
      ab = true
    }
  }, [token, t])

  async function slotWaehlen(sv: OeffentlichesSvProfil, slot: SlotVorschlag) {
    setStep('absenden')
    setFehler(null)
    try {
      const r = await bucheTerminFlow(token, sv.svId, slot.start, slot.end)
      if (!r.ok) {
        setFehler(r.error ?? t('errors.buchung'))
        setStep('auswahl')
        return
      }
      onGebucht({ svVorname: sv.vorname, svAvatar: sv.profilbild ?? null, startIso: slot.start })
    } catch {
      setFehler(t('errors.buchung'))
      setStep('auswahl')
    }
  }

  if (step === 'laden' || step === 'absenden') {
    return (
      <div className="max-w-md text-center">
        <p className="text-claimondo-navy/70">
          {step === 'laden' ? t('matching.suche') : t('matching.moment')}
        </p>
      </div>
    )
  }
  if (step === 'kein_match') {
    return (
      <div className="max-w-md text-center" data-testid="buchung-kein-match">
        <h1 className="text-2xl font-semibold text-claimondo-navy mb-3">{t('matching.kein_match_heading')}</h1>
        <p className="text-claimondo-navy/70">
          {fehler ?? t('matching.kein_match_body')}
        </p>
      </div>
    )
  }
  if (step === 'fehler') {
    return (
      <div className="max-w-md text-center">
        <p className="text-claimondo-navy/70">{fehler ?? t('errors.allgemein')}</p>
      </div>
    )
  }
  return <SvSlotAuswahl svs={svs} fehler={fehler} onSlot={slotWaehlen} />
}
