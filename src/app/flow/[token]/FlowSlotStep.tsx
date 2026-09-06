'use client'

// AAR-956 §3a: Slot-Step im /flow (termin-loser Lead). Reuse SvSlotAuswahl +
// lead-gekeytes ladeMatchingFlow/bucheTerminFlow. NUR Match + Reservierung — KEIN
// SA/account (das macht /flow's eigener Pfad). Bei Erfolg → onGebucht (Wizard hebt
// die Auswahl + advanced zum gutachter-Step).
// AAR-956 §4 / Task 3: fehlt der Besichtigungsort, fragt der Step ihn im Flow ab
// (GooglePlaceAutocomplete) statt "wir melden uns telefonisch" — danach Resolver erneut.

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { SvSlotAuswahl } from '@/components/self-service/SvSlotAuswahl'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import { WunschterminPicker } from '@/app/embed/gutachter-finder/_components/WunschterminPicker'
import { ladeMatchingFlow, bucheTerminFlow, speichereBesichtigungsortFlow } from './self-service-actions'
import type { OeffentlichesSvProfil, SlotVorschlag } from '@/lib/sv-matching-modul/types'
import { Button } from '@/components/primitives/Button/Button.web'

export type GebuchterTermin = { svVorname: string; svAvatar: string | null; startIso: string; besichtigungsAdresse?: string | null }

export function FlowSlotStep({
  token,
  onGebucht,
  onOhneTermin,
  onKeinMatch,
  onSvSelect,
}: {
  token: string
  onGebucht: (t: GebuchterTermin) => void
  // AAR-956: Termin nicht-blockierend. kein_match (kein Slot am Ort) + dezenter Skip
  // → ohne Buchung weiter zur SA. SV wird dort per AAR-908 zugeordnet, der Termin
  // nachgelagert telefonisch vereinbart (kein Conversion-Dead-End mehr).
  onOhneTermin?: () => void
  // AAR-956 Dead-Pin-Fallback: feuert GENAU wenn 0 buchbare Partner (statt der
  // internen kein_match-Ansicht). Der Consumer (Embed) übernimmt dann mit den
  // Lite-Dead-Pin-Karten. Optional + additiv — ohne die Prop (z.B. /flow) bleibt
  // das bisherige kein_match-Verhalten unverändert.
  onKeinMatch?: () => void
  // AAR-956 #4 (Embed, Aaron 12.06.): der Nutzer waehlt im Slot-Step einen SV → der Consumer
  // (Embed) laesst die Karte dorthin routen + hebt ihn hervor. Optional/additiv — ohne die
  // Prop (/flow, /anfrage) keine Auswahl-Interaktion, keine Hervorhebung (Karte unveraendert).
  onSvSelect?: (sv: OeffentlichesSvProfil) => void
}) {
  const t = useTranslations('selfService')
  const [step, setStep] = useState<
    'laden' | 'auswahl' | 'absenden' | 'fehler' | 'kein_match' | 'ort_abfragen'
  >('laden')
  const [svs, setSvs] = useState<OeffentlichesSvProfil[]>([])
  const [fehler, setFehler] = useState<string | null>(null)
  const [ortSpeichern, setOrtSpeichern] = useState(false)
  // AAR-956: optionaler Wunschtermin (Berlin-Wall-Clock "YYYY-MM-DDTHH:MM" oder "").
  // Wird beim Ort-Bestaetigen an speichereBesichtigungsortFlow gereicht -> lead.wunschtermin
  // -> ladeMatchingFlow rankt die Slots danach. Leer = naechste freie Termine.
  const [wunschterminLokal, setWunschterminLokal] = useState('')
  // AAR-956 #4: der aktuell hervorgehobene SV (default = #1/empfohlen). Nur gesetzt/genutzt
  // wenn onSvSelect vorliegt (Embed) — der Default-Set emittiert NICHT (die Karte zeigt den
  // Top-SV beim Ort-Schritt schon), erst die Nutzer-Auswahl re-routet.
  const [selectedSvId, setSelectedSvId] = useState<string | null>(null)
  // Item 1: Ort-Vorschlag aus unfallort (ladeMatchingFlow) — 1-Klick-Bestaetigung statt Neueingabe.
  const [vorschlagOrt, setVorschlagOrt] = useState<{ adresse: string; lat: number; lng: number } | null>(null)
  // Item 3: der im Flow gewaehlte Besichtigungsort -> via onGebucht in den gutachter-Step
  // (sonst zeigt der die stale, beim Page-Load server-gerenderte Adresse).
  const besichtigungsAdresseRef = useRef<string | null>(null)

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
          setVorschlagOrt(r.vorschlagOrt ?? null) // Item 1
          setStep('ort_abfragen')
          return
        }
        setFehler(r.error ?? null)
        setStep('fehler')
        return
      }
      const list = r.svs ?? []
      if (list.length === 0 || list.every((sv) => sv.slots.length === 0)) {
        // AAR-956 Dead-Pin-Fallback: 0 buchbare Partner → Consumer übernimmt (Embed:
        // Lite-Dead-Pin-Karten). Ohne onKeinMatch (/flow) das bisherige Verhalten.
        if (onKeinMatch) {
          onKeinMatch()
          return
        }
        setStep('kein_match')
        return
      }
      setSvs(list)
      setStep('auswahl')
      // #4: Top-SV (list[0]) als Default hervorheben — kein Emit (Karte zeigt ihn schon).
      if (onSvSelect && list[0]) setSelectedSvId(list[0].svId)
    } catch {
      setFehler(t('matching.laden_fehler'))
      setStep('fehler')
    }
  }

  useEffect(() => {
    void runMatch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // Task 3: Besichtigungsort im Flow nachreichen → speichern → erneut matchen.
  // Item 3: den gewaehlten Ort merken, damit der gutachter-Step ihn zeigt.
  async function speichereOrtUndMatch(ort: { adresse: string; lat: number; lng: number }) {
    besichtigungsAdresseRef.current = ort.adresse
    setOrtSpeichern(true)
    setFehler(null)
    const r = await speichereBesichtigungsortFlow(token, ort, wunschterminLokal || null)
    setOrtSpeichern(false)
    if (!r.ok) {
      setFehler(r.error ?? t('ort.fehler_speichern'))
      return
    }
    await runMatch()
  }
  async function besichtigungsortGewaehlt(ort: PlaceResult) {
    await speichereOrtUndMatch({ adresse: ort.adresse, lat: ort.lat, lng: ort.lng })
  }

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
      onGebucht({ svVorname: sv.vorname, svAvatar: sv.profilbild ?? null, startIso: slot.start, besichtigungsAdresse: besichtigungsAdresseRef.current })
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
  if (step === 'ort_abfragen') {
    return (
      <div className="max-w-md" data-testid="buchung-ort-abfragen">
        <h1 className="text-2xl font-semibold text-claimondo-navy mb-2">{t('ort.titel')}</h1>
        <p className="text-sm text-claimondo-ondo mb-4">{t('ort.hinweis')}</p>
        {/* AAR-956: optionaler Wunschtermin — rankt die Gutachter-Slots (lead.wunschtermin
            -> ladeMatchingFlow). Hardcoded-DE wie im Embed-Finder (per-Locale-JSON ohne
            Key-Fallback -> fehlender i18n-Key wuerde Nicht-de-Kunden crashen). */}
        <div className="mb-5">
          <h2 className="text-base font-semibold text-claimondo-navy">Ihr Wunschtermin</h2>
          <p className="mt-0.5 mb-2 text-sm text-claimondo-ondo">
            Optional — wählen Sie Ihren Wunschtag und die Uhrzeit.
          </p>
          <WunschterminPicker value={wunschterminLokal} onChange={setWunschterminLokal} />
        </div>
        {/* Item 1: Vorschlag aus dem gemeldeten Unfallort — 1-Klick bestaetigen oder unten anders waehlen. */}
        {vorschlagOrt && (
          <div className="mb-4 rounded-ios-lg border border-claimondo-ondo/20 bg-claimondo-ondo/5 p-4">
            <p className="text-xs text-claimondo-ondo mb-1">{t('ort.vorschlag_label')}</p>
            <p className="text-sm font-medium text-claimondo-navy mb-3">{vorschlagOrt.adresse}</p>
            <Button
              variant="ondo"
              size="md"
              onClick={() => speichereOrtUndMatch(vorschlagOrt)}
              disabled={ortSpeichern}
              data-testid="buchung-ort-vorschlag-bestaetigen"
            >
              {t('ort.vorschlag_bestaetigen')}
            </Button>
            <p className="mt-3 text-xs text-claimondo-ondo/70">{t('ort.vorschlag_oder')}</p>
          </div>
        )}
        <GooglePlaceAutocomplete
          placeholder={t('ort.placeholder')}
          onSelect={besichtigungsortGewaehlt}
        />
        {ortSpeichern && (
          <p className="text-sm text-claimondo-ondo mt-3">{t('ort.speichern_laeuft')}</p>
        )}
        {fehler && <p className="text-sm text-danger-strong mt-3">{fehler}</p>}
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
        {onOhneTermin && (
          <Button
            variant="ondo"
            size="md"
            onClick={onOhneTermin}
            className="mt-5"
            data-testid="buchung-ohne-termin"
          >
            {t('matching.ohne_termin_cta')}
          </Button>
        )}
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
  return (
    <div>
      <SvSlotAuswahl
        svs={svs}
        fehler={fehler}
        onSlot={slotWaehlen}
        onSvSelect={
          onSvSelect
            ? (sv) => {
                setSelectedSvId(sv.svId)
                onSvSelect(sv)
              }
            : undefined
        }
        selectedSvId={onSvSelect ? selectedSvId : undefined}
      />
      {onOhneTermin && (
        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={onOhneTermin}
            className="text-sm text-claimondo-ondo underline"
            data-testid="buchung-spaeter-link"
          >
            {t('matching.spaeter_link')}
          </button>
        </div>
      )}
    </div>
  )
}
