'use client'

// AAR-296 W1: Mobile-first Upload-UI für ZB1.
// 4 Schritte: Hinweise → Vorschau → Upload+OCR läuft → Erfolg/Fehler.
// Kamera-Capture (capture=environment) + Galerie-Fallback (H1).
// Client-side Komprimierung auf max ~2MB via canvas.toBlob (H8).

import { useState, useRef } from 'react'
import { uploadZb1ViaToken } from './_actions'
import { CameraIcon, ImageIcon, CheckCircle2Icon, AlertCircleIcon, RefreshCwIcon } from 'lucide-react'

type Step = 'hinweise' | 'vorschau' | 'uploading' | 'erfolg' | 'fehler'

const MAX_DIMENSION = 2400 // Pixel — runterskalieren wenn größer
const JPEG_QUALITY = 0.85

async function compressImage(file: File): Promise<{ base64: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height / width) * MAX_DIMENSION)
            width = MAX_DIMENSION
          } else {
            width = Math.round((width / height) * MAX_DIMENSION)
            height = MAX_DIMENSION
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Canvas-Context nicht verfügbar'))
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('Komprimierung fehlgeschlagen'))
            const r2 = new FileReader()
            r2.onload = (ev) => {
              const dataUrl = ev.target?.result as string
              const base64 = dataUrl.split(',')[1] ?? ''
              resolve({ base64, contentType: 'image/jpeg' })
            }
            r2.onerror = () => reject(new Error('Base64-Konvertierung fehlgeschlagen'))
            r2.readAsDataURL(blob)
          },
          'image/jpeg',
          JPEG_QUALITY,
        )
      }
      img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'))
    reader.readAsDataURL(file)
  })
}

export default function Zb1UploadClient({
  token,
  vorname,
}: {
  token: string
  vorname: string
}) {
  const [step, setStep] = useState<Step>('hinweise')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imageContentType, setImageContentType] = useState<string>('image/jpeg')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [extracted, setExtracted] = useState<{
    kennzeichen?: string | null
    fahrzeug_hersteller?: string | null
    fahrzeug_modell?: string | null
    halter_name?: string | null
  } | null>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Bitte ein Bild wählen (JPG/PNG)')
      return
    }
    setErrorMsg('')
    try {
      const { base64, contentType } = await compressImage(file)
      setImageBase64(base64)
      setImageContentType(contentType)
      // Preview-URL aus base64
      setPreviewUrl(`data:${contentType};base64,${base64}`)
      setStep('vorschau')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Bild konnte nicht verarbeitet werden')
    }
  }

  async function handleUpload() {
    if (!imageBase64) return
    setStep('uploading')
    setErrorMsg('')
    try {
      const r = await uploadZb1ViaToken(token, imageBase64, imageContentType)
      if (r.success) {
        setExtracted(r.extracted ?? null)
        setStep('erfolg')
      } else {
        setErrorMsg(r.error ?? 'Upload fehlgeschlagen')
        setStep('fehler')
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Netzwerk-Fehler')
      setStep('fehler')
    }
  }

  function reset() {
    setPreviewUrl(null)
    setImageBase64(null)
    setErrorMsg('')
    setExtracted(null)
    setStep('hinweise')
  }

  return (
    <div className="min-h-screen bg-[#f8f9fb] py-6 px-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <span className="text-2xl font-bold tracking-tight">
            <span className="text-[#0D1B3E]">Claim</span>
            <span className="text-[#7BA3CC]">ondo</span>
          </span>
          <p className="text-xs text-gray-500 mt-1">Fahrzeugschein-Upload</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
          {step === 'hinweise' && (
            <>
              <h1 className="text-lg font-semibold text-gray-900">
                Hallo {vorname || 'und willkommen'}!
              </h1>
              <p className="text-sm text-gray-600">
                Bitte fotografieren Sie Ihren <strong>Fahrzeugschein (Zulassungsbescheinigung Teil I, Vorderseite)</strong>.
                Wir lesen die Daten automatisch aus.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-blue-900">Tipps für gute Lesbarkeit:</p>
                <ul className="text-xs text-blue-800 space-y-1">
                  <li>✓ Alle 4 Ecken des Dokuments sichtbar</li>
                  <li>✓ Gutes Licht — keine Schatten</li>
                  <li>✓ Scharfes Foto — nicht verwackelt</li>
                  <li>✓ Kein Spiegel-Reflex auf der Folie</li>
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex flex-col items-center gap-1 px-3 py-4 rounded-xl bg-[#0D1B3E] text-white text-sm font-semibold hover:bg-[#1E3A5F]"
                >
                  <CameraIcon className="w-6 h-6" />
                  Jetzt fotografieren
                </button>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="flex flex-col items-center gap-1 px-3 py-4 rounded-xl bg-white border border-[#4573A2] text-[#4573A2] text-sm font-semibold hover:bg-blue-50"
                >
                  <ImageIcon className="w-6 h-6" />
                  Aus Galerie wählen
                </button>
              </div>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="hidden"
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="hidden"
              />
              {errorMsg && <p className="text-xs text-red-600">{errorMsg}</p>}
            </>
          )}

          {step === 'vorschau' && previewUrl && (
            <>
              <h2 className="text-base font-semibold text-gray-900">Foto prüfen</h2>
              <p className="text-xs text-gray-500">Sind alle 4 Ecken gut zu sehen?</p>
              <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Fahrzeugschein-Vorschau" className="w-full h-auto" />
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={reset}
                  className="px-3 py-3 rounded-xl bg-white border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50"
                >
                  Nochmal
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-[#0D1B3E] text-white text-sm font-semibold hover:bg-[#1E3A5F]"
                >
                  <CheckCircle2Icon className="w-4 h-4" />
                  Verwenden
                </button>
              </div>
            </>
          )}

          {step === 'uploading' && (
            <div className="py-8 text-center space-y-4">
              <div className="w-12 h-12 mx-auto border-4 border-[#4573A2] border-t-transparent rounded-full animate-spin" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-gray-900">Wird hochgeladen ...</p>
                <p className="text-xs text-gray-500">Daten werden ausgelesen — bitte warten</p>
              </div>
            </div>
          )}

          {step === 'erfolg' && (
            <div className="py-6 text-center space-y-3">
              <div className="w-14 h-14 mx-auto bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2Icon className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Vielen Dank!</h2>
              <p className="text-sm text-gray-600">
                Ihr Fahrzeugschein wurde empfangen. Ihr Ansprechpartner meldet sich in Kürze.
              </p>
              {extracted && (extracted.kennzeichen || extracted.fahrzeug_hersteller) && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-left text-xs space-y-1">
                  <p className="font-semibold text-green-900">Wir haben erkannt:</p>
                  {extracted.kennzeichen && <p className="text-green-800">Kennzeichen: <strong>{extracted.kennzeichen}</strong></p>}
                  {(extracted.fahrzeug_hersteller || extracted.fahrzeug_modell) && (
                    <p className="text-green-800">
                      Fahrzeug: <strong>{[extracted.fahrzeug_hersteller, extracted.fahrzeug_modell].filter(Boolean).join(' ')}</strong>
                    </p>
                  )}
                  {extracted.halter_name && <p className="text-green-800">Halter: <strong>{extracted.halter_name}</strong></p>}
                </div>
              )}
              <p className="text-[10px] text-gray-400">Sie können diese Seite jetzt schließen.</p>
            </div>
          )}

          {step === 'fehler' && (
            <div className="py-6 text-center space-y-3">
              <div className="w-14 h-14 mx-auto bg-amber-100 rounded-full flex items-center justify-center">
                <AlertCircleIcon className="w-8 h-8 text-amber-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Hat nicht geklappt</h2>
              <p className="text-sm text-gray-600">{errorMsg || 'Daten konnten nicht ausgelesen werden.'}</p>
              <p className="text-xs text-gray-500">
                Tipp: gutes Licht, alle 4 Ecken sichtbar, scharf — bitte erneut versuchen.
              </p>
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0D1B3E] text-white text-sm font-semibold hover:bg-[#1E3A5F]"
              >
                <RefreshCwIcon className="w-4 h-4" />
                Erneut versuchen
              </button>
            </div>
          )}
        </div>

        <p className="text-[10px] text-gray-400 text-center mt-4">
          Ihre Daten werden verschlüsselt übertragen und nur für die Bearbeitung Ihres Schadens verwendet.
        </p>
      </div>
    </div>
  )
}
