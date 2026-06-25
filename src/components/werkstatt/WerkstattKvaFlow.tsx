'use client'

// Task 5: KVA-Upload -> OCR-Review -> Uebergabe (Tab / QR / WhatsApp).
// Drei Phasen via useState; Server-Actions aus ./kva/actions + ./kva/qr-action.

import { useState, useRef } from 'react'
import {
  UploadIcon,
  CheckCircleIcon,
  ExternalLinkIcon,
  QrCodeIcon,
  RefreshCcwIcon,
} from 'lucide-react'
import { Button } from '@/components/primitives'
import { Card } from '@/components/primitives'
import { TextField } from '@/components/shared/forms/TextField'
import { Checkbox } from '@/components/ui/checkbox'
import { extrahiereKvaOcr, erstelleWerkstattLeadAusKva } from '@/app/werkstatt/(shell)/kva/actions'
import { qrSvgFuerToken } from '@/app/werkstatt/(shell)/kva/qr-action'

type Phase = 'upload' | 'review' | 'fertig'

type ReviewState = {
  vorname: string
  nachname: string
  email: string
  telefon: string
  fahrzeug_hersteller: string
  fahrzeug_modell: string
  kennzeichen: string
  fin: string
  erstzulassung: string
  fahrzeug_baujahr: string
  kostenvoranschlag_netto: string
  kostenvoranschlag_brutto: string
  perWhatsApp: boolean
  // Roh-OCR + Original-Datei fuer Storage-Upload
  ocrRoh: unknown
  kvaBase64: string
  kvaMediaType: string
  ocrHinweis: string | null
}

const LEER: ReviewState = {
  vorname: '',
  nachname: '',
  email: '',
  telefon: '',
  fahrzeug_hersteller: '',
  fahrzeug_modell: '',
  kennzeichen: '',
  fin: '',
  erstzulassung: '',
  fahrzeug_baujahr: '',
  kostenvoranschlag_netto: '',
  kostenvoranschlag_brutto: '',
  perWhatsApp: false,
  ocrRoh: null,
  kvaBase64: '',
  kvaMediaType: '',
  ocrHinweis: null,
}

function parseNumOpt(v: string): number | null {
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function WerkstattKvaFlow() {
  const [phase, setPhase] = useState<Phase>('upload')
  const [review, setReview] = useState<ReviewState>(LEER)
  const [uploading, setUploading] = useState(false)
  const [speichern, setSpeichern] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  // Fertig-Phase
  const [token, setToken] = useState('')
  const [qrSvg, setQrSvg] = useState('')
  const [flowUrl, setFlowUrl] = useState('')
  const [qrLaden, setQrLaden] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setPhase('upload')
    setReview(LEER)
    setFehler(null)
    setToken('')
    setQrSvg('')
    setFlowUrl('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleDatei(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFehler(null)

    if (file.size > 10 * 1024 * 1024) {
      setFehler('Die Datei ist zu groß — maximal 10 MB.')
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    setUploading(true)

    const reader = new FileReader()
    reader.onload = async () => {
      const b64 = (reader.result as string).split(',')[1]
      const mediaType = file.type || 'application/octet-stream'

      const result = await extrahiereKvaOcr({ base64: b64, mediaType })

      let ocrHinweis: string | null = null
      let data = result.ok ? result.data : null
      if (!result.ok) {
        ocrHinweis = `OCR konnte das Dokument nicht lesen: ${result.error}. Bitte Felder manuell ausfüllen.`
      }

      setReview({
        vorname: data?.halter_vorname ?? '',
        nachname: data?.halter_nachname ?? '',
        email: '',
        telefon: data?.telefon ?? '',
        fahrzeug_hersteller: data?.fahrzeug_hersteller ?? '',
        fahrzeug_modell: data?.fahrzeug_modell ?? '',
        kennzeichen: data?.kennzeichen ?? '',
        fin: data?.fin ?? '',
        erstzulassung: data?.erstzulassung ?? '',
        fahrzeug_baujahr: data?.fahrzeug_baujahr != null ? String(data.fahrzeug_baujahr) : '',
        kostenvoranschlag_netto: data?.kostenvoranschlag_netto != null ? String(data.kostenvoranschlag_netto) : '',
        kostenvoranschlag_brutto: data?.kostenvoranschlag_brutto != null ? String(data.kostenvoranschlag_brutto) : '',
        perWhatsApp: false,
        ocrRoh: data,
        kvaBase64: b64,
        kvaMediaType: mediaType,
        ocrHinweis,
      })

      setUploading(false)
      setPhase('review')
    }
    reader.onerror = () => {
      setFehler('Datei konnte nicht gelesen werden.')
      setUploading(false)
    }
    reader.readAsDataURL(file)
  }

  function set(field: keyof ReviewState, value: string | boolean) {
    setReview((prev) => ({ ...prev, [field]: value }))
  }

  async function handleLeadAnlegen() {
    setFehler(null)
    setSpeichern(true)

    const result = await erstelleWerkstattLeadAusKva({
      vorname: review.vorname || null,
      nachname: review.nachname || null,
      email: review.email || null,
      telefon: review.telefon || null,
      fahrzeug_hersteller: review.fahrzeug_hersteller || null,
      fahrzeug_modell: review.fahrzeug_modell || null,
      kennzeichen: review.kennzeichen || null,
      fin: review.fin || null,
      erstzulassung: review.erstzulassung || null,
      fahrzeug_baujahr: parseNumOpt(review.fahrzeug_baujahr),
      kostenvoranschlag_netto: parseNumOpt(review.kostenvoranschlag_netto),
      kostenvoranschlag_brutto: parseNumOpt(review.kostenvoranschlag_brutto),
      ocrRoh: review.ocrRoh,
      kvaBase64: review.kvaBase64 || null,
      kvaMediaType: review.kvaMediaType || null,
      perWhatsApp: review.perWhatsApp,
    })

    if (!result.ok) {
      setFehler(result.error ?? 'Lead konnte nicht angelegt werden.')
      setSpeichern(false)
      return
    }

    setToken(result.token)

    // QR-SVG laden
    setQrLaden(true)
    const qrResult = await qrSvgFuerToken(result.token)
    if (qrResult.ok) {
      setQrSvg(qrResult.svg)
      setFlowUrl(qrResult.url)
    }
    setQrLaden(false)

    setSpeichern(false)
    setPhase('fertig')
  }

  // ── Upload-Phase ─────────────────────────────────────────────────────────
  if (phase === 'upload') {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
        <header>
          <h1 className="text-heading-md text-claimondo-navy font-bold">Kostenvoranschlag hochladen</h1>
          <p className="text-body text-claimondo-ondo mt-0.5">
            Laden Sie den KVA des Kunden hoch. Die OCR liest Fahrzeug- und Betragsdaten automatisch vor —
            Sie können alles im nächsten Schritt prüfen und ergänzen.
          </p>
        </header>

        <Card bordered radius="md">
          <div className="space-y-4">
            <p className="text-body-xs uppercase tracking-wider text-claimondo-ondo font-medium">
              Dokument auswählen (PDF, JPG, PNG)
            </p>
            <label
              htmlFor="kva-datei"
              className="flex flex-col items-center justify-center gap-3 rounded-ios-lg border-2 border-dashed border-claimondo-border bg-claimondo-bg p-8 cursor-pointer hover:border-claimondo-ondo transition-colors"
            >
              <UploadIcon width={28} height={28} className="text-claimondo-ondo" />
              <span className="text-body text-claimondo-navy font-medium">
                Datei auswählen oder hierher ziehen
              </span>
              <span className="text-body-xs text-claimondo-shield">PDF, JPG oder PNG, max. 10 MB</span>
              <input
                ref={fileRef}
                id="kva-datei"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={handleDatei}
                disabled={uploading}
              />
            </label>
            {uploading && (
              <p className="text-body-xs text-claimondo-ondo text-center animate-pulse">
                OCR läuft — Daten werden ausgelesen …
              </p>
            )}
            {fehler && <p className="text-xs text-danger-strong">{fehler}</p>}
          </div>
        </Card>
      </div>
    )
  }

  // ── Review-Phase ─────────────────────────────────────────────────────────
  if (phase === 'review') {
    const telefonGesetzt = review.telefon.trim().length > 0
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
        <header>
          <h1 className="text-heading-md text-claimondo-navy font-bold">Daten prüfen & ergänzen</h1>
          <p className="text-body text-claimondo-ondo mt-0.5">
            Die OCR hat folgende Daten erkannt. Bitte prüfen und bei Bedarf korrigieren.
          </p>
          {review.ocrHinweis && (
            <p className="mt-2 rounded-ios-sm bg-warning-soft px-3 py-2 text-xs text-warning-strong">
              {review.ocrHinweis}
            </p>
          )}
        </header>

        <Card bordered radius="md">
          <div className="space-y-5">
            <p className="text-body-xs uppercase tracking-wider text-claimondo-ondo font-medium">
              Fahrzeugdaten
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField
                label="Hersteller"
                value={review.fahrzeug_hersteller}
                onChange={(e) => set('fahrzeug_hersteller', e.target.value)}
                placeholder="z.B. BMW"
              />
              <TextField
                label="Modell"
                value={review.fahrzeug_modell}
                onChange={(e) => set('fahrzeug_modell', e.target.value)}
                placeholder="z.B. 320d"
              />
              <TextField
                label="Kennzeichen"
                value={review.kennzeichen}
                onChange={(e) => set('kennzeichen', e.target.value)}
                placeholder="z.B. K-AB 1234"
              />
              <TextField
                label="FIN / VIN"
                value={review.fin}
                onChange={(e) => set('fin', e.target.value)}
                placeholder="17-stellig"
              />
              <TextField
                label="Erstzulassung (JJJJ-MM-TT)"
                value={review.erstzulassung}
                onChange={(e) => set('erstzulassung', e.target.value)}
                placeholder="2019-03-01"
              />
              <TextField
                label="Baujahr"
                type="number"
                value={review.fahrzeug_baujahr}
                onChange={(e) => set('fahrzeug_baujahr', e.target.value)}
                placeholder="2019"
              />
            </div>
          </div>
        </Card>

        <Card bordered radius="md">
          <div className="space-y-5">
            <p className="text-body-xs uppercase tracking-wider text-claimondo-ondo font-medium">
              Kostenvoranschlag
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField
                label="Nettobetrag (€)"
                type="number"
                step="0.01"
                value={review.kostenvoranschlag_netto}
                onChange={(e) => set('kostenvoranschlag_netto', e.target.value)}
                placeholder="3245.67"
              />
              <TextField
                label="Bruttobetrag (€)"
                type="number"
                step="0.01"
                value={review.kostenvoranschlag_brutto}
                onChange={(e) => set('kostenvoranschlag_brutto', e.target.value)}
                placeholder="3862.35"
              />
            </div>
          </div>
        </Card>

        <Card bordered radius="md">
          <div className="space-y-5">
            <p className="text-body-xs uppercase tracking-wider text-claimondo-ondo font-medium">
              Kundendaten
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField
                label="Vorname"
                value={review.vorname}
                onChange={(e) => set('vorname', e.target.value)}
                placeholder="Max"
              />
              <TextField
                label="Nachname"
                value={review.nachname}
                onChange={(e) => set('nachname', e.target.value)}
                placeholder="Mustermann"
              />
              <TextField
                label="E-Mail"
                type="email"
                value={review.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="max@beispiel.de"
              />
              <TextField
                label="Telefon (optional)"
                type="tel"
                value={review.telefon}
                onChange={(e) => set('telefon', e.target.value)}
                placeholder="+49 170 123 4567"
              />
            </div>

            {telefonGesetzt && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
                  checked={review.perWhatsApp}
                  onCheckedChange={(c) => set('perWhatsApp', c === true)}
                />
                <span className="text-body-xs text-claimondo-navy">
                  FlowLink per WhatsApp an den Kunden senden
                </span>
              </label>
            )}
          </div>
        </Card>

        {fehler && <p className="text-xs text-danger-strong">{fehler}</p>}

        <div className="flex gap-3">
          <Button
            variant="ghost"
            onClick={reset}
            disabled={speichern}
          >
            Abbrechen
          </Button>
          <Button
            variant="navy"
            onClick={handleLeadAnlegen}
            loading={speichern}
          >
            Lead anlegen &amp; FlowLink erzeugen
          </Button>
        </div>
      </div>
    )
  }

  // ── Fertig-Phase (Übergabe) ───────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      <header className="flex items-start gap-3">
        <CheckCircleIcon width={28} height={28} className="text-success-strong shrink-0 mt-0.5" />
        <div>
          <h1 className="text-heading-md text-claimondo-navy font-bold">Lead angelegt!</h1>
          <p className="text-body text-claimondo-ondo mt-0.5">
            Der FlowLink wurde erzeugt. Übergeben Sie ihn jetzt an den Kunden.
          </p>
        </div>
      </header>

      {/* Direktlink auf diesem Gerät öffnen */}
      <Card bordered radius="md">
        <div className="space-y-3">
          <p className="text-body-xs uppercase tracking-wider text-claimondo-ondo font-medium">
            Auf diesem Gerät öffnen
          </p>
          {flowUrl && (
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={flowUrl}
                className="flex-1 font-mono text-sm text-claimondo-navy bg-claimondo-bg border border-claimondo-border rounded-ios-sm px-3 py-2.5 truncate"
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
          )}
          <Button
            variant="navy"
            iconLeft={<ExternalLinkIcon width={14} height={14} />}
            onClick={() => window.open(`/flow/${token}`, '_blank')}
          >
            FlowLink öffnen
          </Button>
        </div>
      </Card>

      {/* QR-Code */}
      <Card bordered radius="md">
        <div className="space-y-3">
          <p className="text-body-xs uppercase tracking-wider text-claimondo-ondo font-medium inline-flex items-center gap-1.5">
            <QrCodeIcon width={12} height={12} />
            QR-Code zum Scannen
          </p>
          {qrLaden ? (
            <p className="text-body-xs text-claimondo-ondo animate-pulse">QR-Code wird geladen …</p>
          ) : qrSvg ? (
            <>
              <div
                className="flex items-center justify-center p-6 rounded-ios-xl bg-claimondo-bg border border-claimondo-border"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              <p className="text-body-xs text-claimondo-shield text-center">
                Kunde scannt den Code und öffnet den vorausgefüllten FlowLink.
              </p>
            </>
          ) : null}
        </div>
      </Card>

      {/* WhatsApp-Hinweis */}
      {review.perWhatsApp && review.telefon && (
        <Card bordered radius="md">
          <p className="text-body-xs text-claimondo-navy">
            Der FlowLink wurde per WhatsApp an <strong>{review.telefon}</strong> gesendet.
          </p>
        </Card>
      )}

      <Button
        variant="ghost"
        iconLeft={<RefreshCcwIcon width={14} height={14} />}
        onClick={reset}
      >
        Weiteren Kunden anlegen
      </Button>
    </div>
  )
}
