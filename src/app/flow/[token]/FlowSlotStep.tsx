'use client'

// AAR-956 §3a: Slot-Step im /flow (termin-loser Lead). Reuse SvSlotAuswahl +
// lead-gekeytes ladeMatchingFlow/bucheTerminFlow. NUR Match + Reservierung — KEIN
// SA/account (das macht /flow's eigener Pfad). Bei Erfolg → onGebucht (Wizard hebt
// die Auswahl + advanced zum gutachter-Step).
// AAR-956 §4 / Task 3: fehlt der Besichtigungsort, fragt der Step ihn im Flow ab
// (GooglePlaceAutocomplete) statt "wir melden uns telefonisch" — danach Resolver erneut.

import { useEffect, useState } from 'react'
import { SvSlotAuswahl } from '@/components/self-service/SvSlotAuswahl'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import { ladeMatchingFlow, bucheTerminFlow, speichereBesichtigungsortFlow } from './self-service-actions'
import type { OeffentlichesSvProfil, SlotVorschlag } from '@/lib/sv-matching-modul/types'

export type GebuchterTermin = { svVorname: string; svAvatar: string | null; startIso: string }

export function FlowSlotStep({
  token,
  onGebucht,
}: {
  token: string
  onGebucht: (t: GebuchterTermin) => void
}) {
  const [step, setStep] = useState<
    'laden' | 'auswahl' | 'absenden' | 'fehler' | 'kein_match' | 'ort_abfragen'
  >('laden')
  const [svs, setSvs] = useState<OeffentlichesSvProfil[]>([])
  const [fehler, setFehler] = useState<string | null>(null)
  const [ortSpeichern, setOrtSpeichern] = useState(false)

  // AAR-956 §4: ein Resolver-Lauf. ortFehlt → Adress-Abfrage im Flow (Task 3),
  // sonst Slot-Auswahl bzw. kein_match. Wiederverwendbar nach dem Ort-Nachreichen.
  async function runMatch() {
    setStep('laden')
    setFehler(null)
    try {
      const r = await ladeMatchingFlow(token)
      if (!r.ok) {
        if (r.ortFehlt) {
          // Ort fehlt ist KEIN Fehler mehr — die Adress-Abfrage IST die Aufloesung.
          // Die telefonisch-Botschaft (r.error) NICHT anzeigen (sonst widerspruechlich).
          setFehler(null)
          setStep('ort_abfragen')
          return
        }
        setFehler(r.error ?? null)
        setStep('fehler')
        return
      }
      const list = r.svs ?? []
      if (list.length === 0 || list.every((sv) => sv.slots.length === 0)) {
        setStep('kein_match')
        return
      }
      setSvs(list)
      setStep('auswahl')
    } catch {
      setFehler('Beim Laden der Gutachter ist ein Fehler aufgetreten.')
      setStep('fehler')
    }
  }

  useEffect(() => {
    void runMatch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // Task 3: Besichtigungsort im Flow nachreichen → speichern → erneut matchen.
  async function besichtigungsortGewaehlt(ort: PlaceResult) {
    setOrtSpeichern(true)
    setFehler(null)
    const r = await speichereBesichtigungsortFlow(token, {
      adresse: ort.adresse,
      lat: ort.lat,
      lng: ort.lng,
    })
    setOrtSpeichern(false)
    if (!r.ok) {
      setFehler(r.error ?? 'Adresse konnte nicht gespeichert werden.')
      return
    }
    await runMatch()
  }

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
  if (step === 'ort_abfragen') {
    return (
      <div className="max-w-md" data-testid="buchung-ort-abfragen">
        <h1 className="text-2xl font-semibold text-claimondo-navy mb-2">
          Wo sollen wir Ihr Fahrzeug begutachten?
        </h1>
        <p className="text-sm text-claimondo-ondo mb-4">
          Geben Sie den Besichtigungsort ein — dann zeigen wir Ihnen passende Gutachter-Termine in
          der Nähe.
        </p>
        <GooglePlaceAutocomplete
          placeholder="Adresse des Besichtigungsorts"
          onSelect={besichtigungsortGewaehlt}
        />
        {ortSpeichern && (
          <p className="text-sm text-claimondo-ondo mt-3">
            Einen Moment, wir suchen passende Termine …
          </p>
        )}
        {fehler && <p className="text-sm text-red-500 mt-3">{fehler}</p>}
      </div>
    )
  }
  if (step === 'kein_match') {
    return (
      <div className="max-w-md text-center" data-testid="buchung-kein-match">
        <h1 className="text-2xl font-semibold text-claimondo-navy mb-3">Wir melden uns bei Ihnen</h1>
        <p className="text-claimondo-navy/70">
          {fehler ??
            'Für Ihren Standort konnten wir gerade keinen freien Gutachter-Termin finden. Unser Team meldet sich kurzfristig telefonisch bei Ihnen.'}
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
