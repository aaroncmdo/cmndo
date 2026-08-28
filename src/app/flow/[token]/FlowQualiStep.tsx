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

type Phase = 'frage' | 'versicherung' | 'werkstattbindung' | 'sende' | 'abbruch' | 'selbstzahler' | 'fehler'

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
  onSzenario?: (schuldfrage: string, ueberEigeneVersicherung: boolean | null) => void
}) {
  const t = useTranslations('selfService')
  const [phase, setPhase] = useState<Phase>('frage')
  const [fehler, setFehler] = useState<string | null>(null)

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
      // WS2 (Kasko-frei): abbruch ZUERST pruefen — Kasko-gebunden liefert abrechnungsweg='kasko'
      // UND ergebnis='abbruch' (KaskoEndansicht); der abrechnungsweg-Check unten wuerde sonst
      // faelschlich einen Claim erzeugen.
      if (r.ergebnis === 'abbruch') {
        setPhase('abbruch')
        return
      }
      // AAR-956 gegner-conditional: gewaehlte Schuldfrage an den Wizard melden.
      onSchuldfrage?.(schuldfrage)

      if (r.abrechnungsweg === 'selbstzahler' || r.abrechnungsweg === 'kasko') {
        // SP-B2 + Aaron 08.07.: Selbstzahler UND Kasko(freie Wahl) = Direct-Reparatur — der partielle
        // Claim wird angelegt (das Kunde-Portal braucht ihn). Kein SV-Gutachten.
        setPhase('selbstzahler')
        const claimRes = await erzeugeSelbstzahlerClaim(token)
        if (!claimRes.ok) {
          setPhase('fehler')
          setFehler(claimRes.error)
          return
        }
        onSelbstzahler?.(claimRes.claimId)
        // Aaron 14.07.: FRUEHER sprang der Flow hier direkt in den Account-Step — Kasko/Selbstzahler
        // sahen damit WEDER die Feststellung NOCH den Werkstatt-Finder. Jetzt uebernimmt der Wizard das
        // neue Szenario aus der DB-Config und routet weiter: Feststellung(Schaden) -> Fahrzeugstandort
        // -> Werkstatt -> Konto.
        onSzenario?.(schuldfrage, ueberEigeneVersicherung ?? null)
        return
      }

      // Aaron 14.07.: Das Szenario wechselt (unqualifiziert -> haftpflicht / teilschuld) -> der Wizard
      // berechnet die Step-Sequenz neu aus der Config. onWeiter bleibt der Legacy-Fallback.
      if (onSzenario) {
        onSzenario(schuldfrage, ueberEigeneVersicherung ?? null)
        return
      }
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
        <h1 className="text-2xl font-semibold text-claimondo-navy mb-2">Wir richten Ihren Vorgang ein…</h1>
        <p className="text-claimondo-navy/70">Gleich finden Sie eine passende Werkstatt in Ihrer Nähe.</p>
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
            <span className="block text-sm text-claimondo-navy/60">Eine kurze Rückfrage zu Ihrer Kasko-Werkstattwahl.</span>
          </button>
          <button
            type="button"
            data-testid="quali-versicherung-nein"
            onClick={() => void sende('eigenverantwortung', false)}
            className="w-full text-left rounded-ios-xl border border-claimondo-border bg-white px-5 py-4 transition hover:border-claimondo-ondo"
          >
            <span className="block font-semibold text-claimondo-navy">Nein, ich zahle die Reparatur selbst</span>
            <span className="block text-sm text-claimondo-navy/60">Wir finden Ihnen eine passende Werkstatt.</span>
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'werkstattbindung') {
    // WS2 (Kasko-frei): nach „Ja, Kasko" fragen, ob der Kunde an eine Versicherer-Werkstatt
    // gebunden ist. Frei (nein) -> Werkstatt-Strecke; gebunden (ja) -> KaskoEndansicht.
    return (
      <div className="max-w-md w-full">
        <h1 className="text-2xl font-semibold text-claimondo-navy mb-2 text-center">
          Sind Sie an eine Werkstatt Ihrer Versicherung gebunden?
        </h1>
        <p className="text-claimondo-navy/60 text-sm mb-6 text-center">
          Manche Kasko-Tarife schreiben eine Partnerwerkstatt vor. Wenn Sie frei wählen dürfen, finden wir Ihnen eine passende Werkstatt.
        </p>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            data-testid="quali-werkstattbindung-nein"
            onClick={() => void sende('eigenverantwortung', true, true)}
            className="w-full text-left rounded-ios-xl border border-claimondo-border bg-white px-5 py-4 transition hover:border-claimondo-ondo"
          >
            <span className="block font-semibold text-claimondo-navy">Nein, ich kann die Werkstatt frei wählen</span>
            <span className="block text-sm text-claimondo-navy/60">Wir finden Ihnen eine passende Werkstatt für die Reparatur.</span>
          </button>
          <button
            type="button"
            data-testid="quali-werkstattbindung-ja"
            onClick={() => void sende('eigenverantwortung', true, false)}
            className="w-full text-left rounded-ios-xl border border-claimondo-border bg-white px-5 py-4 transition hover:border-claimondo-ondo"
          >
            <span className="block font-semibold text-claimondo-navy">Ja, meine Versicherung schreibt die Werkstatt vor</span>
            <span className="block text-sm text-claimondo-navy/60">Dann wenden Sie sich bitte direkt an Ihre Kaskoversicherung.</span>
          </button>
        </div>
      </div>
    )
  }

  return <QualiOptionen vorname={vorname} disabled={phase === 'sende'} onWaehle={waehle} />
}
