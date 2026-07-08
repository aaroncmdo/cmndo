'use client'

// Inkrement 2 (WRITE) — KVA aus dem Auftrag erstellen. Die Werkstatt laedt
// optional das KVA-PDF hoch (OCR liest netto/brutto vor), prueft/ergaenzt die
// Betraege und speichert sie auf den bestehenden Claim
// (erstelleKvaFuerAuftrag -> claims.kostenvoranschlag_netto/brutto). Flippt den
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

export function KvaErstellenModal({
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
          setOcrHinweis('Keine Beträge erkannt — bitte manuell eintragen.')
        }
      } else {
        setOcrHinweis(`OCR konnte das Dokument nicht lesen: ${result.error}. Bitte Beträge manuell eintragen.`)
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
    const nettoNum = parseNumOpt(netto)
    const bruttoNum = parseNumOpt(brutto)
    if (nettoNum == null && bruttoNum == null) {
      setFehler('Bitte mindestens einen Betrag (netto oder brutto) angeben.')
      return
    }

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
    <Modal open={open} onClose={handleClose} ariaLabel="Kostenvoranschlag erstellen" maxWidth={520}>
      <div className="space-y-5">
        <div className="space-y-1">
          <h2 className="text-heading-sm text-claimondo-navy font-semibold">Kostenvoranschlag erstellen</h2>
          <p className="text-body-sm text-claimondo-ondo">
            Optional das KVA-PDF hochladen — die OCR liest die Beträge automatisch vor. Prüfen Sie
            netto/brutto und speichern Sie. Der Kunde benötigt den Kostenvoranschlag für die Freigabe.
          </p>
        </div>

        {/* Optionaler Upload */}
        <div className="space-y-2">
          <p className="text-body-xs uppercase tracking-wider text-claimondo-ondo font-medium">
            Dokument (optional — PDF, JPG, PNG)
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

        {/* Betraege */}
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
              ariaLabel="Nettobetrag in Euro"
              placeholder="3245.67"
              disabled={ocrLaden || speichern}
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
              ariaLabel="Bruttobetrag in Euro"
              placeholder="3862.35"
              disabled={ocrLaden || speichern}
            />
          </div>
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
            disabled={ocrLaden}
            onClick={handleSpeichern}
          >
            Kostenvoranschlag speichern
          </Button>
        </div>
      </div>
    </Modal>
  )
}
