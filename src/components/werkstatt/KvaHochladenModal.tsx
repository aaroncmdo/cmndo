'use client'

// Inkrement 2 (WRITE) — Kostenvoranschlag NUR HOCHLADEN. Die Werkstatt erstellt
// KEINEN KVA aus dem Nichts; sie laedt ihren offiziellen KVA als PDF hoch, die OCR
// (extrahiereKvaFuerAuftragOcr) liest netto/brutto AUS dem Dokument. Die Betraege
// bleiben leicht editierbar (OCR-Korrektur), sind aber keine Frei-Eingabe. Der
// Upload ist Pflicht: ohne PDF kein Speichern. erstelleKvaFuerAuftrag schreibt
// claims.kostenvoranschlag_netto/brutto auf den bestehenden Claim, legt das PDF im
// Storage ab und haengt eine fall_dokumente-Zeile fuer den Kunden an. Flippt den
// Auftrag benoetigt -> erstellt.

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { UploadIcon } from 'lucide-react'

import { Button, Input, Modal } from '@/components/primitives'
import {
  erstelleKvaFuerAuftrag,
  extrahiereKvaFuerAuftragOcr,
} from '@/app/werkstatt/(shell)/auftraege/actions'

function parseNumOpt(v: string): number | null {
  const s = v.trim()
  if (!s) return null
  const n = parseFloat(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function KvaHochladenModal({
  claimId,
  open,
  onClose,
}: {
  claimId: string
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [netto, setNetto] = useState('')
  const [brutto, setBrutto] = useState('')
  const [pdfBase64, setPdfBase64] = useState<string | null>(null)
  const [pdfMediaType, setPdfMediaType] = useState<string | null>(null)
  const [dateiName, setDateiName] = useState<string | null>(null)
  const [ocrLaden, setOcrLaden] = useState(false)
  const [ocrHinweis, setOcrHinweis] = useState<string | null>(null)
  const [speichern, setSpeichern] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const pdfHochgeladen = pdfBase64 != null && pdfMediaType != null

  function reset() {
    setNetto('')
    setBrutto('')
    setPdfBase64(null)
    setPdfMediaType(null)
    setDateiName(null)
    setOcrLaden(false)
    setOcrHinweis(null)
    setSpeichern(false)
    setFehler(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleClose() {
    if (ocrLaden || speichern) return
    reset()
    onClose()
  }

  async function handleDatei(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFehler(null)
    setOcrHinweis(null)

    if (file.size > 10 * 1024 * 1024) {
      setFehler('Die Datei ist zu groß — maximal 10 MB.')
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    setOcrLaden(true)
    const reader = new FileReader()
    reader.onload = async () => {
      const b64 = (reader.result as string).split(',')[1]
      const mediaType = file.type || 'application/octet-stream'
      setPdfBase64(b64)
      setPdfMediaType(mediaType)
      setDateiName(file.name)

      const result = await extrahiereKvaFuerAuftragOcr({ base64: b64, mediaType })
      if (result.ok) {
        if (result.netto != null) setNetto(String(result.netto))
        if (result.brutto != null) setBrutto(String(result.brutto))
        if (result.netto == null && result.brutto == null) {
          setOcrHinweis('Keine Beträge erkannt — bitte aus dem Dokument nachtragen.')
        }
      } else {
        setOcrHinweis(`OCR konnte das Dokument nicht lesen: ${result.error}. Bitte Beträge aus dem Dokument nachtragen.`)
      }
      setOcrLaden(false)
    }
    reader.onerror = () => {
      setFehler('Datei konnte nicht gelesen werden.')
      setOcrLaden(false)
    }
    reader.readAsDataURL(file)
  }

  async function handleSpeichern() {
    setFehler(null)
    if (!pdfHochgeladen) {
      setFehler('Bitte laden Sie den Kostenvoranschlag als PDF hoch.')
      return
    }
    const nettoNum = parseNumOpt(netto)
    const bruttoNum = parseNumOpt(brutto)

    setSpeichern(true)
    const res = await erstelleKvaFuerAuftrag(claimId, {
      netto: nettoNum,
      brutto: bruttoNum,
      pdfBase64,
      pdfMediaType,
    })
    setSpeichern(false)

    if (!res.ok) {
      setFehler(res.error)
      toast.error(res.error)
      return
    }
    toast.success('Kostenvoranschlag gespeichert.')
    reset()
    onClose()
    router.refresh()
  }

  return (
    <Modal open={open} onClose={handleClose} ariaLabel="Kostenvoranschlag hochladen" maxWidth={520}>
      <div className="space-y-5">
        <div className="space-y-1">
          <h2 className="text-heading-sm text-claimondo-navy font-semibold">Kostenvoranschlag hochladen</h2>
          <p className="text-body-sm text-claimondo-ondo">
            Laden Sie den Kostenvoranschlag als PDF hoch — die Beträge werden automatisch
            ausgelesen. Der Kunde benötigt den Kostenvoranschlag für die Freigabe.
          </p>
        </div>

        {/* Pflicht-Upload */}
        <div className="space-y-2">
          <p className="text-body-xs uppercase tracking-wider text-claimondo-ondo font-medium">
            Kostenvoranschlag (PDF, JPG oder PNG) — erforderlich
          </p>
          <label
            htmlFor="auftrag-kva-datei"
            className="flex flex-col items-center justify-center gap-2 rounded-ios-lg border-2 border-dashed border-claimondo-border bg-claimondo-bg p-6 cursor-pointer hover:border-claimondo-ondo transition-colors"
          >
            <UploadIcon width={24} height={24} className="text-claimondo-ondo" />
            <span className="text-body-sm text-claimondo-navy font-medium">
              {dateiName ?? 'Datei auswählen'}
            </span>
            <span className="text-body-xs text-claimondo-shield">PDF, JPG oder PNG, max. 10 MB</span>
            <input
              ref={fileRef}
              id="auftrag-kva-datei"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={handleDatei}
              disabled={ocrLaden || speichern}
            />
          </label>
          {ocrLaden && (
            <p className="text-body-xs text-claimondo-ondo animate-pulse">
              KVA wird ausgelesen …
            </p>
          )}
          {ocrHinweis && (
            <p className="rounded-ios-sm bg-warning-soft px-3 py-2 text-body-xs text-warning-strong">
              {ocrHinweis}
            </p>
          )}
        </div>

        {/* Betraege — aus dem Dokument gelesen, nur zur Korrektur editierbar */}
        <div className="space-y-2">
          <p className="text-body-xs uppercase tracking-wider text-claimondo-ondo font-medium">
            Beträge — aus dem Dokument gelesen
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="auftrag-kva-netto" className="text-body-xs font-medium text-claimondo-navy">
                Netto (€)
              </label>
              <Input
                value={netto}
                onChangeText={setNetto}
                inputType="number"
                name="auftrag-kva-netto"
                ariaLabel="Nettobetrag in Euro (aus dem Dokument gelesen)"
                placeholder="—"
                disabled={ocrLaden || speichern || !pdfHochgeladen}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="auftrag-kva-brutto" className="text-body-xs font-medium text-claimondo-navy">
                Brutto (€)
              </label>
              <Input
                value={brutto}
                onChangeText={setBrutto}
                inputType="number"
                name="auftrag-kva-brutto"
                ariaLabel="Bruttobetrag in Euro (aus dem Dokument gelesen)"
                placeholder="—"
                disabled={ocrLaden || speichern || !pdfHochgeladen}
              />
            </div>
          </div>
          {pdfHochgeladen && (
            <p className="text-body-xs text-claimondo-shield">
              Falls die automatische Erkennung daneben liegt, können Sie die Beträge korrigieren.
            </p>
          )}
        </div>

        {fehler && <p className="text-body-xs text-danger-strong">{fehler}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" disabled={ocrLaden || speichern} onClick={handleClose}>
            Abbrechen
          </Button>
          <Button
            variant="navy"
            size="sm"
            loading={speichern}
            disabled={ocrLaden || !pdfHochgeladen}
            onClick={handleSpeichern}
          >
            Speichern
          </Button>
        </div>
      </div>
    </Modal>
  )
}
