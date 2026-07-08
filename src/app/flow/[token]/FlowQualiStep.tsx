'use client'

// AAR-956 §3a + SP-B1/B2: Quali-Step im /flow. gegner/unklar wie bisher. eigenverantwortung
// oeffnet eine Versicherungs-Folgefrage -> kasko ODER selbstzahler; BEIDE laufen seit
// Aaron 08.07. als Direct-Reparatur (SP-B2: partieller Claim via erzeugeSelbstzahlerClaim
// -> onSelbstzahler -> Account-Step/Portal + Werkstatt-Strecke, kein SV-Gutachten).
// KaskoEndansicht bleibt nur fuer echte Disqualifikationen (ergebnis='abbruch').
// QualiOptionen bleibt unberuehrt.

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { QualiOptionen } from '@/components/self-service/QualiOptionen'
import { KaskoEndansicht } from '@/components/self-service/KaskoEndansicht'
import { speichereQualiFlow, erzeugeSelbstzahlerClaim } from './self-service-actions'

type Phase = 'frage' | 'versicherung' | 'sende' | 'abbruch' | 'selbstzahler' | 'fehler'

export function FlowQualiStep({
  token,
  vorname,
  onWeiter,
  onSchuldfrage,
  onSelbstzahler,
}: {
  token: string
  vorname: string | null
  onWeiter: () => void
  onSchuldfrage?: (v: string) => void
  onSelbstzahler?: (claimId: string) => void
}) {
  const t = useTranslations('selfService')
  const [phase, setPhase] = useState<Phase>('frage')
  const [fehler, setFehler] = useState<string | null>(null)

  async function sende(schuldfrage: string, ueberEigeneVersicherung?: boolean) {
    setPhase('sende')
    setFehler(null)
    try {
      const r = await speichereQualiFlow(token, schuldfrage, ueberEigeneVersicherung)
      if (!r.ok) {
        setPhase('fehler')
        setFehler(r.error ?? t('errors.allgemein'))
        return
      }
      if (r.abrechnungsweg === 'selbstzahler' || r.abrechnungsweg === 'kasko') {
        // SP-B2 + Aaron 08.07.: Selbstzahler UND Kasko = Direct-Reparatur — partiellen Claim
        // erzeugen, dann via onSelbstzahler in den Account-Step (Portal). Werkstatt-Strecke,
        // kein SV-Gutachten. Kasko ist jetzt ergebnis='weiter' (nicht mehr 'abbruch').
        setPhase('selbstzahler')
        const claimRes = await erzeugeSelbstzahlerClaim(token)
        if (!claimRes.ok) {
          setPhase('fehler')
          setFehler(claimRes.error)
          return
        }
        onSelbstzahler?.(claimRes.claimId)
        return
      }
      if (r.ergebnis === 'abbruch') {
        setPhase('abbruch')
        return
      }
      // AAR-956 gegner-conditional: gewaehlte Schuldfrage an den Wizard melden.
      onSchuldfrage?.(schuldfrage)
      onWeiter()
    } catch {
      setPhase('fehler')
      setFehler(t('errors.unerwartet'))
    }
  }

  function waehle(value: string) {
    // eigenverantwortung -> Versicherungs-Folgefrage (kasko vs selbstzahler). Sonst direkt senden.
    if (value === 'eigenverantwortung') {
      setPhase('versicherung')
      return
    }
    void sende(value)
  }

  if (phase === 'abbruch') return <KaskoEndansicht />

  if (phase === 'selbstzahler') {
    return (
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-claimondo-navy mb-2">Wir richten deinen Vorgang ein…</h1>
        <p className="text-claimondo-navy/70">Gleich findest du eine passende Werkstatt in deiner Nähe.</p>
      </div>
    )
  }

  if (phase === 'fehler') {
    return (
      <div className="max-w-md text-center">
        <p className="text-claimondo-navy/70">{fehler}</p>
      </div>
    )
  }

  if (phase === 'versicherung') {
    return (
      <div className="max-w-md w-full">
        <h1 className="text-2xl font-semibold text-claimondo-navy mb-2 text-center">
          Kannst du den Schaden über eine eigene Kaskoversicherung regulieren?
        </h1>
        <p className="text-claimondo-navy/60 text-sm mb-6 text-center">
          Voll- oder Teilkasko, über die du den Schaden abrechnen könntest.
        </p>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            data-testid="quali-versicherung-ja"
            onClick={() => void sende('eigenverantwortung', true)}
            className="w-full text-left rounded-ios-xl border border-claimondo-border bg-white px-5 py-4 transition hover:border-claimondo-ondo"
          >
            <span className="block font-semibold text-claimondo-navy">Ja, ich habe eine Kaskoversicherung</span>
            <span className="block text-sm text-claimondo-navy/60">Wir finden dir eine passende Werkstatt für die Reparatur.</span>
          </button>
          <button
            type="button"
            data-testid="quali-versicherung-nein"
            onClick={() => void sende('eigenverantwortung', false)}
            className="w-full text-left rounded-ios-xl border border-claimondo-border bg-white px-5 py-4 transition hover:border-claimondo-ondo"
          >
            <span className="block font-semibold text-claimondo-navy">Nein, ich zahle die Reparatur selbst</span>
            <span className="block text-sm text-claimondo-navy/60">Wir finden dir eine passende Werkstatt.</span>
          </button>
        </div>
      </div>
    )
  }

  return <QualiOptionen vorname={vorname} disabled={phase === 'sende'} onWaehle={waehle} />
}
