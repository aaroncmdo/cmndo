'use client'

// AAR-352: Mobile-first Multi-Slot-Upload-UI.
// Zeigt eine Liste der angefragten Dokumente mit Status pro Slot.
// Pro Slot kann der Kunde ein Foto machen/wählen → Vorschau → Upload.
// Nach Upload wird der Slot als „hochgeladen" markiert; wenn alle Slots
// gefüllt sind, erscheint der globale Abschluss-Screen.

import { useState, useRef } from 'react'
import { uploadDokumentViaAnfrageToken } from './_actions'
import {
  CameraIcon,
  ImageIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
  RefreshCwIcon,
  FileTextIcon,
} from 'lucide-react'

type SlotId = 'fahrzeugschein' | 'polizeibericht' | 'unfallfotos' | 'sonstiges'

type SlotUi = {
  slot_id: SlotId
  label: string
  ocr: boolean
  hochgeladen: boolean
}

type SlotAction = 'idle' | 'vorschau' | 'uploading' | 'erfolg' | 'fehler'

type SlotState = {
  action: SlotAction
  previewUrl: string | null
  imageBase64: string | null
  imageContentType: string
  errorMsg: string
  extracted?: {
    kennzeichen?: string | null
    fahrzeug_hersteller?: string | null
    fahrzeug_modell?: string | null
    halter_name?: string | null
  } | null
}

const MAX_DIMENSION = 2400
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

const SLOT_HINTS: Record<SlotId, string> = {
  fahrzeugschein: 'Zulassungsbescheinigung Teil I (Vorderseite). Alle 4 Ecken sichtbar, gutes Licht, scharf.',
  polizeibericht: 'Der Zettel, den Sie nach dem Unfall von der Polizei bekommen haben.',
  unfallfotos: 'Fotos vom Fahrzeugschaden — mehrere Ansichten willkommen (Front, Heck, Seiten, Detail). Je mehr Fotos, desto besser die Schadenbeschreibung.',
  sonstiges: 'Beliebiges Dokument zum Fall — z. B. Kaufvertrag, Rechnung, Foto.',
}

function emptySlotState(): SlotState {
  return {
    action: 'idle',
    previewUrl: null,
    imageBase64: null,
    imageContentType: 'image/jpeg',
    errorMsg: '',
    extracted: null,
  }
}

export default function MultiSlotUploadClient({
  token,
  vorname,
  slots: initialSlots,
}: {
  token: string
  vorname: string
  slots: SlotUi[]
}) {
  const [slots, setSlots] = useState<SlotUi[]>(initialSlots)
  const [slotStates, setSlotStates] = useState<Record<string, SlotState>>(() => {
    const init: Record<string, SlotState> = {}
    initialSlots.forEach((s) => {
      init[s.slot_id] = emptySlotState()
    })
    return init
  })

  const alleHochgeladen = slots.every((s) => s.hochgeladen)

  return (
    <div className="min-h-screen bg-[#f8f9fb] py-6 px-4">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <span className="text-2xl font-bold tracking-tight">
            <span className="text-[#0D1B3E]">Claim</span>
            <span className="text-[#7BA3CC]">ondo</span>
          </span>
          <p className="text-xs text-gray-500 mt-1">Dokumenten-Upload</p>
        </div>

        {alleHochgeladen ? (
          <AbschlussCard vorname={vorname} />
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
            <div className="space-y-1">
              <h1 className="text-lg font-semibold text-gray-900">
                Hallo {vorname || 'und willkommen'}!
              </h1>
              <p className="text-sm text-gray-600">
                Bitte laden Sie die folgenden Dokumente hoch. Sie können das einzeln erledigen —
                jedes Dokument wird sofort gespeichert.
              </p>
              <div className="pt-2">
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#4573A2] transition-all"
                    style={{
                      width: `${(slots.filter((s) => s.hochgeladen).length / slots.length) * 100}%`,
                    }}
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  {slots.filter((s) => s.hochgeladen).length} von {slots.length} hochgeladen
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {slots.map((s) => (
                <SlotCard
                  key={s.slot_id}
                  slot={s}
                  state={slotStates[s.slot_id]}
                  onFile={async (file) => {
                    if (!file.type.startsWith('image/')) {
                      setSlotStates((prev) => ({
                        ...prev,
                        [s.slot_id]: {
                          ...prev[s.slot_id],
                          errorMsg: 'Bitte ein Bild wählen (JPG/PNG)',
                        },
                      }))
                      return
                    }
                    try {
                      const { base64, contentType } = await compressImage(file)
                      setSlotStates((prev) => ({
                        ...prev,
                        [s.slot_id]: {
                          ...emptySlotState(),
                          action: 'vorschau',
                          previewUrl: `data:${contentType};base64,${base64}`,
                          imageBase64: base64,
                          imageContentType: contentType,
                        },
                      }))
                    } catch (err) {
                      setSlotStates((prev) => ({
                        ...prev,
                        [s.slot_id]: {
                          ...prev[s.slot_id],
                          errorMsg: err instanceof Error ? err.message : 'Bild-Fehler',
                        },
                      }))
                    }
                  }}
                  onUpload={async () => {
                    const st = slotStates[s.slot_id]
                    if (!st.imageBase64) return
                    setSlotStates((prev) => ({
                      ...prev,
                      [s.slot_id]: { ...prev[s.slot_id], action: 'uploading', errorMsg: '' },
                    }))
                    try {
                      const r = await uploadDokumentViaAnfrageToken(
                        token,
                        s.slot_id,
                        st.imageBase64,
                        st.imageContentType,
                      )
                      if (r.success) {
                        setSlotStates((prev) => ({
                          ...prev,
                          [s.slot_id]: {
                            ...prev[s.slot_id],
                            action: 'erfolg',
                            extracted: r.extracted ?? null,
                          },
                        }))
                        setSlots((prev) =>
                          prev.map((sl) =>
                            sl.slot_id === s.slot_id ? { ...sl, hochgeladen: true } : sl,
                          ),
                        )
                      } else {
                        setSlotStates((prev) => ({
                          ...prev,
                          [s.slot_id]: {
                            ...prev[s.slot_id],
                            action: 'fehler',
                            errorMsg: r.error ?? 'Upload fehlgeschlagen',
                          },
                        }))
                      }
                    } catch (err) {
                      setSlotStates((prev) => ({
                        ...prev,
                        [s.slot_id]: {
                          ...prev[s.slot_id],
                          action: 'fehler',
                          errorMsg: err instanceof Error ? err.message : 'Netzwerk-Fehler',
                        },
                      }))
                    }
                  }}
                  onReset={() =>
                    setSlotStates((prev) => ({ ...prev, [s.slot_id]: emptySlotState() }))
                  }
                />
              ))}
            </div>
          </div>
        )}

        <p className="text-[10px] text-gray-400 text-center mt-4">
          Ihre Daten werden verschlüsselt übertragen und nur für die Bearbeitung Ihres Schadens verwendet.
        </p>
      </div>
    </div>
  )
}

function SlotCard({
  slot,
  state,
  onFile,
  onUpload,
  onReset,
}: {
  slot: SlotUi
  state: SlotState
  onFile: (file: File) => void
  onUpload: () => void
  onReset: () => void
}) {
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  if (slot.hochgeladen) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-3 flex items-center gap-3">
        <CheckCircle2Icon className="w-5 h-5 text-green-600 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-green-900">{slot.label}</p>
          <p className="text-xs text-green-700">Empfangen — danke!</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <FileTextIcon className="w-4 h-4 text-[#4573A2] mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{slot.label}</p>
          <p className="text-[11px] text-gray-500">{SLOT_HINTS[slot.slot_id]}</p>
        </div>
      </div>

      {state.action === 'idle' && (
        <>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex flex-col items-center gap-1 px-2 py-3 rounded-lg bg-[#0D1B3E] text-white text-xs font-semibold hover:bg-[#1E3A5F]"
            >
              <CameraIcon className="w-5 h-5" />
              Fotografieren
            </button>
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="flex flex-col items-center gap-1 px-2 py-3 rounded-lg bg-white border border-[#4573A2] text-[#4573A2] text-xs font-semibold hover:bg-blue-50"
            >
              <ImageIcon className="w-5 h-5" />
              Galerie
            </button>
          </div>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            className="hidden"
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            className="hidden"
          />
          {state.errorMsg && <p className="text-xs text-red-600">{state.errorMsg}</p>}
        </>
      )}

      {state.action === 'vorschau' && state.previewUrl && (
        <>
          <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={state.previewUrl} alt={`${slot.label}-Vorschau`} className="w-full h-auto" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onReset}
              className="px-2 py-2.5 rounded-lg bg-white border border-gray-300 text-gray-700 text-xs font-semibold hover:bg-gray-50"
            >
              Nochmal
            </button>
            <button
              type="button"
              onClick={onUpload}
              className="flex items-center justify-center gap-1 px-2 py-2.5 rounded-lg bg-[#0D1B3E] text-white text-xs font-semibold hover:bg-[#1E3A5F]"
            >
              <CheckCircle2Icon className="w-4 h-4" />
              Verwenden
            </button>
          </div>
        </>
      )}

      {state.action === 'uploading' && (
        <div className="py-4 text-center space-y-2">
          <div className="w-8 h-8 mx-auto border-4 border-[#4573A2] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-gray-900">Wird hochgeladen ...</p>
          {slot.slot_id === 'fahrzeugschein' && slot.ocr && (
            <p className="text-[10px] text-gray-500">Daten werden ausgelesen — bitte warten</p>
          )}
        </div>
      )}

      {state.action === 'erfolg' && (
        <div className="py-2 text-center space-y-2">
          <div className="w-10 h-10 mx-auto bg-green-100 rounded-full flex items-center justify-center">
            <CheckCircle2Icon className="w-6 h-6 text-green-600" />
          </div>
          <p className="text-sm font-semibold text-green-900">Empfangen!</p>
          {state.extracted && (state.extracted.kennzeichen || state.extracted.fahrzeug_hersteller) && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-left text-[11px] space-y-0.5">
              {state.extracted.kennzeichen && (
                <p className="text-green-800">Kennzeichen: <strong>{state.extracted.kennzeichen}</strong></p>
              )}
              {(state.extracted.fahrzeug_hersteller || state.extracted.fahrzeug_modell) && (
                <p className="text-green-800">
                  Fahrzeug: <strong>{[state.extracted.fahrzeug_hersteller, state.extracted.fahrzeug_modell].filter(Boolean).join(' ')}</strong>
                </p>
              )}
              {state.extracted.halter_name && (
                <p className="text-green-800">Halter: <strong>{state.extracted.halter_name}</strong></p>
              )}
            </div>
          )}
          {/* AAR-unfallfotos: Multi-File-Slot — Button für weitere Fotos. */}
          {slot.slot_id === 'unfallfotos' && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#4573A2] text-[#4573A2] text-xs font-semibold hover:bg-blue-50"
            >
              <CameraIcon className="w-3 h-3" />
              Weiteres Foto hochladen
            </button>
          )}
        </div>
      )}

      {state.action === 'fehler' && (
        <div className="py-2 text-center space-y-2">
          <div className="w-10 h-10 mx-auto bg-amber-100 rounded-full flex items-center justify-center">
            <AlertCircleIcon className="w-6 h-6 text-amber-600" />
          </div>
          <p className="text-xs text-gray-600">{state.errorMsg || 'Upload fehlgeschlagen'}</p>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0D1B3E] text-white text-xs font-semibold hover:bg-[#1E3A5F]"
          >
            <RefreshCwIcon className="w-3 h-3" />
            Erneut
          </button>
        </div>
      )}
    </div>
  )
}

function AbschlussCard({ vorname }: { vorname: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 text-center space-y-3">
      <div className="w-14 h-14 mx-auto bg-green-100 rounded-full flex items-center justify-center">
        <CheckCircle2Icon className="w-8 h-8 text-green-600" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900">
        Vielen Dank{vorname ? `, ${vorname}` : ''}!
      </h2>
      <p className="text-sm text-gray-600">
        Alle Dokumente sind angekommen. Ihr Ansprechpartner meldet sich in Kürze.
      </p>
      <p className="text-[10px] text-gray-400">Sie können diese Seite jetzt schließen.</p>
    </div>
  )
}
