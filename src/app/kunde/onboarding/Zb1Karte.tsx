'use client'

// Der Fahrzeugschein im Kunden-Onboarding — Aaron 09.09.2026:
//   „prüfe, ob die korrekt ausgelesen werden, dann die Daten verändert werden können
//    und dann auch akzeptiert wird im Onboarding, dass der Fahrzeugschein schon
//    hochgeladen ist … falls noch kein Fahrzeugschein hochgeladen ist, den ZB1
//    auslesen und dann die Daten bestätigen lassen."
//
// Der bisherige „Schnellstart"-Block konnte keines davon: er zeigte vier Werte rein
// lesend, legte weder Bild noch Dokument in der Akte ab (der Pflichtslot blieb offen,
// der Kunde wurde weiter gemahnt) und bot den Scan auch dann an, wenn der Schein
// laengst vorlag. Gemessen auf prod am 09.09.
//
// Drei Zustaende:
//   vorhanden  — der Schein liegt in der Akte: anerkennen, Werte zum Pruefen anbieten
//   scannen    — kein Schein: Foto aufnehmen
//   pruefen    — Werte editierbar, „Daten bestaetigen" schreibt sie fest
//
// ⭐ Das Bild wird IMMER zuerst in die Akte gelegt, die Texterkennung ist die Kuer.
// Faellt sie aus — am 09.09. auf prod der Fall: Google Vision antwortet
// `403 BILLING_DISABLED` —, ist der Schein trotzdem eingegangen und der Kunde traegt
// die Werte selbst ein, statt vor „konnte nicht ausgelesen werden" zu stehen und
// nichts erreicht zu haben.

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CameraIcon, CheckIcon, FileCheck2Icon, RefreshCwIcon } from 'lucide-react'
import { Button } from '@/components/primitives/Button/Button.web'
import { compressImage } from '@/lib/dokumente/compress-image'
import { VIN_REGEX, istPlausibleFin } from '@/lib/vehicles/ensure-vehicle'
import { uploadPflichtdokument } from './actions'
import { confirmZb1Korrekturen } from '@/app/kunde/onboarding-details/zb1-actions'
import {
  ZB1_GRUPPEN,
  baueZb1Werte,
  nurGeaenderte,
  type Zb1Werte,
} from '@/lib/onboarding/zb1-felder'

type Zustand = 'vorhanden' | 'scannen' | 'laedt' | 'pruefen' | 'gespeichert' | 'fehler'

export function Zb1Karte({
  fallId,
  pflichtdokumentId,
  liegtVor,
  bekannteWerte,
  onDatenGeaendert,
}: {
  fallId: string
  /** Der Pflichtslot „fahrzeugschein" dieses Falls — ohne ihn kann kein Bild abgelegt werden. */
  pflichtdokumentId: string | null
  liegtVor: boolean
  bekannteWerte: Record<string, unknown> | null
  /** Nach dem Bestaetigen: der Elternteil laedt die Server-Daten neu. */
  onDatenGeaendert?: () => void
}) {
  const t = useTranslations('onboarding')
  const tf = useTranslations('wizard_fields')
  const basis = baueZb1Werte(bekannteWerte)
  const [zustand, setZustand] = useState<Zustand>(liegtVor ? 'vorhanden' : 'scannen')
  const [werte, setWerte] = useState<Zb1Werte>(basis)
  const [ausgangswerte, setAusgangswerte] = useState<Zb1Werte>(basis)
  const [ocrFehlgeschlagen, setOcrFehlgeschlagen] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [speichert, setSpeichert] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Die Fahrgestellnummer ist das einzige Feld mit harter Form: siebzehn Zeichen, ohne
  // I, O und Q, mit Ziffern. Passt sie nicht, geht sie NICHT ans Fahrzeug — und damit
  // nicht ins Gutachten. Das sagen wir beim Tippen, nicht erst nach dem Bestaetigen.
  const finEingabe = (werte.fin ?? '').trim().toUpperCase()
  const finUnvollstaendig =
    finEingabe.length > 0 && (!VIN_REGEX.test(finEingabe) || !istPlausibleFin(finEingabe))

  async function handleFile(file: File) {
    setZustand('laedt')
    setFehler(null)
    setOcrFehlgeschlagen(false)

    // 28.08.: ein Handy-Foto (2–5 MB) sprengt die Server-Action („Maximum array nesting
    // exceeded" im React-Flight-Serialisierer, NICHT bodySizeLimit). Derselbe Weg wie im
    // Magic-Link-Upload.
    let bild: { base64: string; contentType: string }
    try {
      bild = await compressImage(file)
    } catch {
      setZustand('fehler')
      setFehler(t('zb1.fehlerFoto'))
      return
    }

    // 1. Das Bild gehoert in die Akte — unabhaengig davon, ob die Texterkennung laeuft.
    if (pflichtdokumentId) {
      const res = await uploadPflichtdokument(
        pflichtdokumentId,
        fallId,
        bild.base64,
        file.name || 'fahrzeugschein.jpg',
        bild.contentType,
      )
      if (!res.success) {
        setZustand('fehler')
        setFehler(res.error ?? t('zb1.fehlerUpload'))
        return
      }
    }

    // 2. Texterkennung — Kuer. Ein Fehlschlag fuehrt in dieselbe Maske, nur leer.
    let gelesen: Zb1Werte = basis
    try {
      const ocr = await fetch('/api/ocr-fahrzeugschein', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fall_id: fallId, image_base64: bild.base64 }),
      }).then((r) => r.json())
      if (ocr?.success && ocr.extracted) {
        // Nur Gelesenes uebernehmen, Bekanntes nicht mit Leere ueberschreiben.
        const ausOcr = baueZb1Werte(ocr.extracted as Record<string, unknown>)
        gelesen = { ...basis }
        for (const [feld, wert] of Object.entries(ausOcr) as [keyof Zb1Werte, string][]) {
          if (wert) gelesen[feld] = wert
        }
      } else {
        setOcrFehlgeschlagen(true)
      }
    } catch {
      setOcrFehlgeschlagen(true)
    }

    setWerte(gelesen)
    setAusgangswerte(gelesen)
    setZustand('pruefen')
    onDatenGeaendert?.()
  }

  async function handleBestaetigen() {
    setSpeichert(true)
    setFehler(null)
    const diff = nurGeaenderte(ausgangswerte, werte)
    if (Object.keys(diff).length > 0) {
      const res = await confirmZb1Korrekturen(fallId, diff)
      if (!res.ok) {
        setSpeichert(false)
        setFehler(res.error)
        return
      }
      // Der Server sagt, wenn die Nummer die Form verfehlt hat: alles andere ist
      // gespeichert, nur sie erreicht das Fahrzeug nicht.
      if (res.finHinweis === 'format') {
        setSpeichert(false)
        setFehler(t('zb1.finNichtUebernommen'))
        return
      }
    }
    setSpeichert(false)
    setAusgangswerte(werte)
    setZustand('gespeichert')
    onDatenGeaendert?.()
  }

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      capture="environment"
      className="hidden"
      data-testid="zb1-foto-input"
      onChange={(e) => {
        const f = e.target.files?.[0]
        if (f) void handleFile(f)
        e.target.value = ''
      }}
    />
  )

  return (
    <div
      className="mt-5 rounded-2xl border border-claimondo-ondo/30 bg-claimondo-ondo/5 p-4"
      data-testid="zb1-karte"
      data-zustand={zustand}
    >
      {fileInput}

      {zustand === 'vorhanden' && (
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success-soft">
            <FileCheck2Icon className="h-5 w-5 text-success" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-claimondo-navy">{t('zb1.liegtVorTitel')}</p>
            <p className="mt-1 text-xs text-claimondo-ondo leading-relaxed">
              {t('zb1.liegtVorText')}
            </p>
            <Werteliste werte={werte} tf={tf} />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="navy" size="sm" onClick={() => setZustand('pruefen')}>
                {t('zb1.pruefenCta')}
              </Button>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="text-xs text-claimondo-ondo underline"
              >
                {t('zb1.neuesFoto')}
              </button>
            </div>
          </div>
        </div>
      )}

      {(zustand === 'scannen' || zustand === 'laedt' || zustand === 'fehler') && (
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-claimondo-ondo/15">
            <CameraIcon className="h-5 w-5 text-claimondo-ondo" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-claimondo-navy">{t('welcome.scanTitle')}</p>
            <p className="mt-1 text-xs text-claimondo-ondo leading-relaxed">
              {t('welcome.scanDescription')}
            </p>
            {fehler && <p className="mt-2 text-xs text-danger-strong">{fehler}</p>}
            <div className="mt-3">
              <Button
                variant="navy"
                size="sm"
                loading={zustand === 'laedt'}
                onClick={() => inputRef.current?.click()}
              >
                {zustand === 'laedt' ? t('welcome.scanning') : t('welcome.takePhoto')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {zustand === 'pruefen' && (
        <div data-testid="zb1-pruefen">
          <p className="text-sm font-semibold text-claimondo-navy">
            {ocrFehlgeschlagen ? t('zb1.manuellTitel') : t('zb1.pruefenTitel')}
          </p>
          <p className="mt-1 text-xs text-claimondo-ondo leading-relaxed">
            {ocrFehlgeschlagen ? t('zb1.manuellText') : tf('zb1_pruefen_hinweis')}
          </p>
          <div className="mt-4 flex flex-col gap-4">
            {ZB1_GRUPPEN.map((gruppe) => (
              <div key={gruppe.titelKey} className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-claimondo-ondo">
                  {tf(gruppe.titelKey)}
                </p>
                {gruppe.felder.map(({ feld, labelKey }) => (
                  <label key={feld} className="flex flex-col gap-1">
                    <span className="text-[11px] text-claimondo-ondo">{tf(labelKey)}</span>
                    <input
                      type="text"
                      value={werte[feld]}
                      data-testid={`zb1-feld-${feld}`}
                      // Funktional aktualisieren: `werte` aus der Closure ist der Stand des
                      // letzten Renders. Zwei Änderungen in verschiedenen Feldern kurz
                      // hintereinander — Ausfüllhilfe, Einfügen, schnelles Tippen — machten
                      // sonst die erste rückgängig, weil die zweite auf einem veralteten
                      // Objekt aufbaut.
                      onChange={(e) => {
                        const wert = e.target.value
                        setWerte((vorher) => ({ ...vorher, [feld]: wert }))
                      }}
                      aria-describedby={feld === 'fin' && finUnvollstaendig ? 'zb1-fin-hinweis' : undefined}
                      className={`w-full rounded-ios-sm border bg-white px-3 py-2 text-sm text-claimondo-navy ${
                        feld === 'fin' && finUnvollstaendig ? 'border-warning' : 'border-claimondo-border'
                      }`}
                    />
                    {feld === 'fin' && finUnvollstaendig && (
                      <span
                        id="zb1-fin-hinweis"
                        data-testid="zb1-fin-hinweis"
                        className="text-[11px] text-warning-strong"
                      >
                        {t('zb1.finForm', { anzahl: finEingabe.length })}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            ))}
          </div>
          {fehler && <p className="mt-2 text-xs text-danger-strong">{fehler}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              variant="navy"
              size="sm"
              loading={speichert}
              onClick={() => void handleBestaetigen()}
            >
              {t('zb1.bestaetigenCta')}
            </Button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-xs text-claimondo-ondo underline"
            >
              {t('zb1.neuesFoto')}
            </button>
          </div>
        </div>
      )}

      {zustand === 'gespeichert' && (
        <div className="flex items-start gap-3" data-testid="zb1-gespeichert">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success-soft">
            <CheckIcon className="h-5 w-5 text-success" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-success-strong">{t('zb1.gespeichertTitel')}</p>
            <Werteliste werte={werte} tf={tf} />
            <button
              type="button"
              onClick={() => setZustand('pruefen')}
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-claimondo-ondo underline"
            >
              <RefreshCwIcon className="h-3 w-3" />
              {t('zb1.nochmalAendern')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Kompakte Anzeige der gefuellten Werte — leere Felder bleiben weg. */
function Werteliste({ werte, tf }: { werte: Zb1Werte; tf: (k: string) => string }) {
  const zeilen = ZB1_GRUPPEN.flatMap((g) => g.felder).filter(({ feld }) => werte[feld])
  if (zeilen.length === 0) return null
  return (
    <ul className="mt-3 space-y-0.5 text-xs text-claimondo-navy" data-testid="zb1-werteliste">
      {zeilen.map(({ feld, labelKey }) => (
        <li key={feld}>
          {tf(labelKey)}: <span className="font-medium">{werte[feld]}</span>
        </li>
      ))}
    </ul>
  )
}
