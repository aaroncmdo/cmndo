'use client'

// AAR-956 §3a: Slot-Step im /flow (termin-loser Lead). Reuse SvSlotAuswahl +
// lead-gekeytes ladeMatchingFlow/bucheTerminFlow. NUR Match + Reservierung — KEIN
// SA/account (das macht /flow's eigener Pfad). Bei Erfolg → onGebucht (Wizard hebt
// die Auswahl + advanced zum gutachter-Step). Kein-Match/Standort-fehlt = Rückruf.

import { useEffect, useState } from 'react'
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
          setStep(r.error?.toLowerCase().includes('besichtigungsort') ? 'kein_match' : 'fehler')
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
          setFehler('Beim Laden der Gutachter ist ein Fehler aufgetreten.')
        }
      })
    return () => {
      ab = true
    }
  }, [token])

  async function slotWaehlen(sv: OeffentlichesSvProfil, slot: SlotVorschlag) {
    setStep('absenden')
    setFehler(null)
    try {
      const r = await bucheTerminFlow(token, sv.svId, slot.start, slot.end)
      if (!r.ok) {
        setFehler(r.error ?? 'Buchung fehlgeschlagen.')
        setStep('auswahl')
        return
      }
      onGebucht({ svVorname: sv.vorname, svAvatar: sv.profilbild ?? null, startIso: slot.start })
    } catch {
      setFehler('Buchung fehlgeschlagen.')
      setStep('auswahl')
    }
  }

  if (step === 'laden' || step === 'absenden') {
    return (
      <div className="max-w-md text-center">
        <p className="text-claimondo-navy/70">
          {step === 'laden' ? 'Wir suchen den passenden Gutachter für Sie …' : 'Einen Moment …'}
        </p>
      </div>
    )
  }
  if (step === 'kein_match') {
    return (
      <div className="max-w-md text-center" data-testid="buchung-kein-match">
        <h1 className="text-2xl font-semibold text-claimondo-navy mb-3">Wir melden uns bei Ihnen</h1>
        <p className="text-claimondo-navy/70">
          {fehler ?? 'Für Ihren Standort konnten wir gerade keinen freien Gutachter-Termin finden. Unser Team meldet sich kurzfristig telefonisch bei Ihnen.'}
        </p>
      </div>
    )
  }
  if (step === 'fehler') {
    return (
      <div className="max-w-md text-center">
        <p className="text-claimondo-navy/70">{fehler ?? 'Es ist ein Fehler aufgetreten.'}</p>
      </div>
    )
  }
  return <SvSlotAuswahl svs={svs} fehler={fehler} onSlot={slotWaehlen} />
}
