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
import { KaskoTarifFrage } from '@/components/self-service/KaskoTarifFrage'
import { KaskoBindungEndansicht } from '@/components/self-service/KaskoBindungEndansicht'
import { KaskoUnklarHinweis } from '@/components/self-service/KaskoUnklarHinweis'
import type { KaskoBindungsInfo, KaskoTarifAuswahl } from '@/lib/kasko-wb/types'
import { speichereQualiFlow, erzeugeSelbstzahlerClaim, fordereRueckrufAn, speichereKaskoTarifFlow } from './self-service-actions'

type Phase = 'frage' | 'versicherung' | 'werkstattbindung' | 'sende' | 'abbruch' | 'abbruch_bindung' | 'unklar' | 'selbstzahler' | 'fehler'
// Kasko-WB Phase 1: die Bindungs-Antwort reist zur Step-Neuberechnung mit (siehe uebernimmSzenario).
type Bindung = { freie_werkstattwahl: boolean | null; werkstattbindung_quelle: string | null }

export function FlowQualiStep({
  token,
  vorname,
  onWeiter,
  onSchuldfrage,
  onSelbstzahler,
  onSzenario,
}: {
  token: string
  vorname: string | null
  onWeiter: () => void
  onSchuldfrage?: (v: string) => void
  onSelbstzahler?: (claimId: string) => void
  /**
   * Aaron 14.07.: Nach der Quali wechselt das Szenario (unqualifiziert -> haftpflicht / kasko /
   * selbstzahler / teilschuld). Der Wizard berechnet die Step-Sequenz dann neu aus der DB-Config.
   * Die Versicherungsantwort muss mit, weil sie kasko von selbstzahler unterscheidet — und weil
   * 'eigenverantwortung' OHNE sie den Lead still disqualifizieren wuerde.
   */
  onSzenario?: (schuldfrage: string, ueberEigeneVersicherung: boolean | null, bindung?: Bindung) => void
}) {
  const t = useTranslations('selfService')
  const [phase, setPhase] = useState<Phase>('frage')
  const [fehler, setFehler] = useState<string | null>(null)
  const [bindungInfo, setBindungInfo] = useState<KaskoBindungsInfo | null>(null)
  const [markeName, setMarkeName] = useState<string | null>(null)
  const [letzteBindung, setLetzteBindung] = useState<Bindung | null>(null)

  async function nachQualiWeiter(
    schuldfrage: string,
    ueberEigeneVersicherung: boolean | undefined,
    abrechnungsweg: string | null | undefined,
    bindung?: Bindung,
  ) {
    // AAR-956 gegner-conditional: gewaehlte Schuldfrage an den Wizard melden.
    onSchuldfrage?.(schuldfrage)
    if (abrechnungsweg === 'selbstzahler' || abrechnungsweg === 'kasko') {
      setPhase('selbstzahler')
      const claimRes = await erzeugeSelbstzahlerClaim(token)
      if (!claimRes.ok) {
        setPhase('fehler')
        setFehler(claimRes.error)
        return
      }
      onSelbstzahler?.(claimRes.claimId)
      onSzenario?.(schuldfrage, ueberEigeneVersicherung ?? null, bindung)
      return
    }
    if (onSzenario) {
      onSzenario(schuldfrage, ueberEigeneVersicherung ?? null, bindung)
      return
    }
    onWeiter()
  }

  async function sende(schuldfrage: string, ueberEigeneVersicherung?: boolean, freieWerkstattwahl?: boolean) {
    setPhase('sende')
    setFehler(null)
    try {
      const r = await speichereQualiFlow(token, schuldfrage, ueberEigeneVersicherung, freieWerkstattwahl)
      if (!r.ok) {
        setPhase('fehler')
        setFehler(r.error ?? t('errors.allgemein'))
        return
      }
      if (r.ergebnis === 'abbruch') {
        setPhase('abbruch')
        return
      }
      await nachQualiWeiter(schuldfrage, ueberEigeneVersicherung, r.abrechnungsweg)
    } catch {
      setPhase('fehler')
      setFehler(t('errors.unerwartet'))
    }
  }

  // Kasko-WB Phase 1: Versicherer + Tarif statt binaerer Bindungsfrage.
  async function sendeKaskoTarif(auswahl: KaskoTarifAuswahl) {
    setPhase('sende')
    setFehler(null)
    setMarkeName(auswahl.markeName)
    try {
      const r = await speichereKaskoTarifFlow(token, auswahl)
      if (!r.ok) {
        setPhase('fehler')
        setFehler(r.error ?? t('errors.allgemein'))
        return
      }
      if (r.ergebnis === 'abbruch') {
        setBindungInfo(r.info)
        setPhase('abbruch_bindung')
        return
      }
      if (r.ergebnis === 'unklar') {
        setLetzteBindung({ freie_werkstattwahl: null, werkstattbindung_quelle: r.quelle })
        setPhase('unklar')
        return
      }
      await nachQualiWeiter('eigenverantwortung', true, 'kasko', { freie_werkstattwahl: r.freieWerkstattwahl, werkstattbindung_quelle: r.quelle })
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

  if (phase === 'abbruch_bindung') {
    // Info nicht ladbar -> generische Endseite, nie zurueck in die Schuldfrage.
    return bindungInfo ? <KaskoBindungEndansicht info={bindungInfo} onRueckruf={() => fordereRueckrufAn(token)} /> : <KaskoEndansicht />
  }
  if (phase === 'unklar') {
    return <KaskoUnklarHinweis markeName={markeName} onWeiter={() => void nachQualiWeiter('eigenverantwortung', true, 'kasko', letzteBindung ?? undefined)} />
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
          Können Sie den Schaden über eine eigene Kaskoversicherung regulieren?
        </h1>
        <p className="text-claimondo-navy/60 text-sm mb-6 text-center">
          Voll- oder Teilkasko, über die Sie den Schaden abrechnen könnten.
        </p>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            data-testid="quali-versicherung-ja"
            onClick={() => setPhase('werkstattbindung')}
            className="w-full text-left rounded-ios-xl border border-claimondo-border bg-white px-5 py-4 transition hover:border-claimondo-ondo"
          >
            <span className="block font-semibold text-claimondo-navy">Ja, ich habe eine Kaskoversicherung</span>
            <span className="block text-sm text-claimondo-navy/60">Eine kurze Rückfrage zu Versicherer und Tarif.</span>
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

  if (phase === 'werkstattbindung') {
    // Kasko-WB Phase 1: Versicherer + Tarif (Wissensbasis) statt „Sind Sie an eine Werkstatt gebunden?".
    return (
      <div className="max-w-md w-full">
        <KaskoTarifFrage onErgebnis={(auswahl) => void sendeKaskoTarif(auswahl)} />
      </div>
    )
  }

  return <QualiOptionen vorname={vorname} disabled={phase === 'sende'} onWaehle={waehle} />
}
