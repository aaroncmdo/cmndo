'use client'

// AAR-757 (VollClient-Auflösung): bündelt die vier unique Tools-Flows die
// bisher über die 7 VollClient-Tabs verstreut waren:
//   - FIN/VIN-Eingabe mit Vorschaden-Prüfung (`saveFinVinGutachter`)
//   - ZB1-Foto vor Ort mit OCR (/api/ocr-fahrzeugschein)
//   - Gutachten-Upload als PDF (`uploadGutachten`)
//   - Freier Datei-Upload mit Kategorie-Select (`uploadDatei`)
//
// Diese Card wird in FallDetailClient direkt gerendert (nicht Tab-gated),
// damit der SV die Tools jederzeit greifbar hat.

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  FileTextIcon,
  ImageIcon,
  Loader2Icon,
  UploadIcon,
  WrenchIcon,
} from 'lucide-react'
import { saveFinVinGutachter, uploadDatei, uploadGutachten } from '../actions'

type Props = {
  fallId: string
  fallFin: string | null
  finQuelle: string | null
  vorschadenGeprueft: boolean
  hatVorschaeden: boolean
  vorschadenAnzahl: number | null
  hasGutachten: boolean
}

const DATEI_KATEGORIEN: { key: string; label: string }[] = [
  { key: 'gutachter-foto', label: 'Gutachter-Foto' },
  { key: 'sonstiges', label: 'Sonstiges' },
  { key: 'unterlagen-kunde', label: 'Unterlagen Kunde' },
  { key: 'werkstatt', label: 'Werkstatt-Doku' },
]

export function SvToolsCard({
  fallId,
  fallFin,
  finQuelle,
  vorschadenGeprueft,
  hatVorschaeden,
  vorschadenAnzahl,
  hasGutachten,
}: Props) {
  const router = useRouter()
  const gutachtenFormRef = useRef<HTMLFormElement>(null)
  const dateiInputRef = useRef<HTMLInputElement>(null)

  const [finInput, setFinInput] = useState('')
  const [finSaving, setFinSaving] = useState(false)
  const [zb1Uploading, setZb1Uploading] = useState(false)
  const [zb1Result, setZb1Result] = useState<{
    extracted: Record<string, string | null>
    message: string
    fieldsFound: number
  } | null>(null)
  const [gutachtenUploading, setGutachtenUploading] = useState(false)
  const [dateiUploading, setDateiUploading] = useState(false)
  const [dateiKategorie, setDateiKategorie] = useState<string>('gutachter-foto')

  async function handleFinSave() {
    setFinSaving(true)
    try {
      await saveFinVinGutachter(fallId, finInput)
      toast.success('FIN gespeichert. Vorschaden-Prüfung gestartet.')
      setFinInput('')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'FIN-Speicherung fehlgeschlagen')
    } finally {
      setFinSaving(false)
    }
  }

  async function handleZb1Foto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setZb1Result(null)
    setZb1Uploading(true)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
      const resp = await fetch('/api/ocr-fahrzeugschein', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fall_id: fallId, image_base64: base64 }),
      })
      const json = await resp.json()
      if (json?.success && json.extracted) {
        setZb1Result({
          extracted: json.extracted,
          message: json.message ?? 'Fahrzeugschein gelesen',
          fieldsFound: json.fields_found ?? 0,
        })
        toast.success('ZB1 erfolgreich ausgelesen')
        router.refresh()
      } else {
        toast.error(json?.error ?? json?.message ?? 'OCR fehlgeschlagen')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ZB1-Upload fehlgeschlagen')
    } finally {
      setZb1Uploading(false)
      e.target.value = ''
    }
  }

  async function handleGutachtenSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setGutachtenUploading(true)
    try {
      const formData = new FormData(e.currentTarget)
      await uploadGutachten(fallId, formData)
      toast.success('Gutachten hochgeladen')
      gutachtenFormRef.current?.reset()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gutachten-Upload fehlgeschlagen')
    } finally {
      setGutachtenUploading(false)
    }
  }

  async function handleDateiUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setDateiUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('kategorie', dateiKategorie)
      await uploadDatei(fallId, formData)
      toast.success(`"${file.name}" hochgeladen`)
      if (dateiInputRef.current) dateiInputRef.current.value = ''
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Datei-Upload fehlgeschlagen')
    } finally {
      setDateiUploading(false)
    }
  }

  return (
    <section className="bg-white rounded-ios-md border border-claimondo-border p-4 sm:p-5 space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo flex items-center gap-2">
        <WrenchIcon className="w-3.5 h-3.5" /> Werkzeuge
      </h3>

      {/* FIN / VIN */}
      {!fallFin ? (
        <div>
          <p className="text-[11px] font-medium text-claimondo-ondo mb-2">FIN / VIN</p>
          <p className="text-xs text-claimondo-ondo/70 mb-2">
            Fahrzeug-Identifikationsnummer (17 Zeichen) für Vorschaden-Prüfung
          </p>
          <div className="flex gap-2">
            <input
              value={finInput}
              onChange={(e) => setFinInput(e.target.value.toUpperCase())}
              placeholder="WBA1234567890ABCD"
              maxLength={17}
              className="flex-1 bg-claimondo-bg border border-claimondo-border rounded-lg px-3 py-2 text-sm text-claimondo-navy font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-claimondo-ondo"
            />
            <button
              onClick={handleFinSave}
              disabled={finSaving || finInput.length !== 17}
              className="bg-claimondo-navy hover:bg-claimondo-ondo disabled:bg-claimondo-border disabled:text-claimondo-ondo/50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {finSaving ? '…' : 'Speichern'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-[11px] font-medium text-claimondo-ondo mb-1">FIN / VIN</p>
          <p className="text-sm text-claimondo-navy font-mono tracking-wider">{fallFin}</p>
          <p className="text-[11px] text-claimondo-ondo/70 mt-1">
            Quelle: {finQuelle ?? '—'}
            {vorschadenGeprueft
              ? hatVorschaeden
                ? ` · Vorschaden: ${vorschadenAnzahl ?? '?'} gefunden`
                : ' · Vorschadenfrei'
              : ' · Prüfung läuft…'}
          </p>
        </div>
      )}

      {/* ZB1-Foto vor Ort */}
      <div className="border-t border-claimondo-border pt-3">
        <p className="text-[11px] font-medium text-claimondo-ondo mb-2 flex items-center gap-1.5">
          <ImageIcon className="w-3 h-3" /> ZB1-Foto vor Ort
        </p>
        <p className="text-xs text-claimondo-ondo/70 mb-2">
          Falls der Kunde den Fahrzeugschein nicht hochgeladen hat — Foto aufnehmen, OCR
          extrahiert Halter, FIN und Kennzeichen automatisch.
        </p>
        <label className="inline-flex items-center gap-2 bg-claimondo-ondo hover:bg-claimondo-navy text-white text-sm font-medium py-2 px-3 rounded-lg cursor-pointer transition-colors">
          {zb1Uploading ? (
            <Loader2Icon className="w-4 h-4 animate-spin" />
          ) : (
            <UploadIcon className="w-4 h-4" />
          )}
          {zb1Uploading ? 'Wird ausgewertet…' : 'ZB1-Foto aufnehmen / hochladen'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={zb1Uploading}
            onChange={handleZb1Foto}
          />
        </label>
        {zb1Result && (
          <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 p-3">
            <p className="text-xs font-semibold text-emerald-800 mb-2">
              {zb1Result.fieldsFound} Felder erkannt
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {zb1Result.extracted.kennzeichen && (
                <div>
                  <span className="text-claimondo-ondo block">KZ</span>
                  <span className="font-medium text-claimondo-navy">
                    {zb1Result.extracted.kennzeichen}
                  </span>
                </div>
              )}
              {zb1Result.extracted.fin_vin && (
                <div>
                  <span className="text-claimondo-ondo block">FIN</span>
                  <span className="font-mono font-medium text-claimondo-navy">
                    {zb1Result.extracted.fin_vin}
                  </span>
                </div>
              )}
              {zb1Result.extracted.fahrzeug_hersteller && (
                <div>
                  <span className="text-claimondo-ondo block">Marke</span>
                  <span className="font-medium text-claimondo-navy">
                    {zb1Result.extracted.fahrzeug_hersteller}
                  </span>
                </div>
              )}
              {zb1Result.extracted.fahrzeug_modell && (
                <div>
                  <span className="text-claimondo-ondo block">Modell</span>
                  <span className="font-medium text-claimondo-navy">
                    {zb1Result.extracted.fahrzeug_modell}
                  </span>
                </div>
              )}
              {zb1Result.extracted.halter_nachname && (
                <div className="col-span-2">
                  <span className="text-claimondo-ondo block">Halter</span>
                  <span className="font-medium text-claimondo-navy">
                    {zb1Result.extracted.halter_vorname} {zb1Result.extracted.halter_nachname}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Gutachten-Upload */}
      {!hasGutachten && (
        <div className="border-t border-claimondo-border pt-3">
          <p className="text-[11px] font-medium text-claimondo-ondo mb-2 flex items-center gap-1.5">
            <FileTextIcon className="w-3 h-3" /> Gutachten hochladen
          </p>
          <form ref={gutachtenFormRef} onSubmit={handleGutachtenSubmit} className="space-y-2">
            <input
              type="file"
              name="gutachten"
              accept=".pdf"
              required
              className="text-xs text-claimondo-ondo file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-claimondo-bg file:text-claimondo-navy file:text-xs file:font-medium hover:file:bg-claimondo-border"
            />
            <button
              type="submit"
              disabled={gutachtenUploading}
              className="inline-flex items-center gap-2 bg-claimondo-navy hover:bg-claimondo-ondo text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors disabled:opacity-50"
            >
              {gutachtenUploading ? (
                <Loader2Icon className="w-4 h-4 animate-spin" />
              ) : (
                <UploadIcon className="w-4 h-4" />
              )}
              {gutachtenUploading ? 'Wird hochgeladen…' : 'Gutachten hochladen'}
            </button>
          </form>
        </div>
      )}

      {/* Freier Datei-Upload */}
      <div className="border-t border-claimondo-border pt-3">
        <p className="text-[11px] font-medium text-claimondo-ondo mb-2 flex items-center gap-1.5">
          <UploadIcon className="w-3 h-3" /> Datei hochladen
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={dateiKategorie}
            onChange={(e) => setDateiKategorie(e.target.value)}
            className="bg-claimondo-bg border border-claimondo-border rounded-lg px-2 py-1.5 text-xs text-claimondo-navy focus:outline-none focus:border-claimondo-ondo"
          >
            {DATEI_KATEGORIEN.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
          <input
            ref={dateiInputRef}
            type="file"
            onChange={handleDateiUpload}
            disabled={dateiUploading}
            className="text-xs text-claimondo-ondo file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-claimondo-bg file:text-claimondo-navy file:text-xs file:font-medium hover:file:bg-claimondo-border"
          />
          {dateiUploading && <Loader2Icon className="w-4 h-4 animate-spin text-claimondo-ondo" />}
        </div>
      </div>
    </section>
  )
}
