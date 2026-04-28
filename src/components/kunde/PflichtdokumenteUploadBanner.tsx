'use client'

// CMM-29: Kompakter Upload-Banner für offene Pflichtdokumente in der
// Kunde-Fallakte. Zeigt nur die Slots die noch nicht erfüllt sind und
// bietet pro Slot einen direkten „Hochladen"-Button. Bei Klick öffnet
// sich der Datei-Picker, die Datei wird Base64-encoded und über die
// existierende uploadPflichtdokument-Server-Action gepusht.
//
// Banner verschwindet automatisch sobald alle Pflicht-Slots erfüllt sind
// (parent rendert null wenn `slots.length === 0` nach Filter).

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { UploadIcon, Loader2Icon, CheckCircle2Icon, AlertCircleIcon } from 'lucide-react'
import { uploadPflichtdokument } from '@/app/kunde/onboarding/actions'
import type { PflichtSlotForView } from '@/components/fall/PflichtdokumenteListe'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export default function PflichtdokumenteUploadBanner({
  slots,
  fallId,
}: {
  slots: PflichtSlotForView[]
  fallId: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null)
  const [errorBySlot, setErrorBySlot] = useState<Record<string, string>>({})
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Nur offene Slots (status !== 'erfuellt')
  const offenSlots = slots.filter((s) => s.status !== 'erfuellt')
  if (offenSlots.length === 0) return null

  const offenPflicht = offenSlots.filter((s) => s.pflicht).length

  function triggerFilePicker(slotId: string) {
    const input = fileInputRefs.current[slotId]
    if (input) input.click()
  }

  async function handleFileChange(slot: PflichtSlotForView, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!slot.pflichtdokument_id) {
      setErrorBySlot((prev) => ({
        ...prev,
        [slot.slot_id]: 'Slot noch nicht initialisiert — bitte über Onboarding-Schritt hinzufügen.',
      }))
      return
    }

    setUploadingSlot(slot.slot_id)
    setErrorBySlot((prev) => {
      const next = { ...prev }
      delete next[slot.slot_id]
      return next
    })

    try {
      const base64 = await fileToBase64(file)
      const pflichtdokumentId = slot.pflichtdokument_id
      startTransition(async () => {
        const result = await uploadPflichtdokument(
          pflichtdokumentId,
          fallId,
          base64,
          file.name,
          file.type || 'application/octet-stream',
        )
        setUploadingSlot(null)
        if (!result.success) {
          setErrorBySlot((prev) => ({
            ...prev,
            [slot.slot_id]: result.error ?? 'Upload fehlgeschlagen',
          }))
        } else {
          router.refresh()
        }
      })
    } catch (err) {
      setUploadingSlot(null)
      setErrorBySlot((prev) => ({
        ...prev,
        [slot.slot_id]: err instanceof Error ? err.message : String(err),
      }))
    } finally {
      // Input-Value zurücksetzen damit derselbe File nochmal ausgewählt werden kann
      if (e.target) e.target.value = ''
    }
  }

  return (
    <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertCircleIcon className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-900">
            {offenPflicht > 0
              ? `${offenPflicht} Pflichtdokument${offenPflicht === 1 ? '' : 'e'} fehlen noch`
              : `${offenSlots.length} Dokument${offenSlots.length === 1 ? '' : 'e'} können hochgeladen werden`}
          </p>
          <p className="text-xs text-amber-800 mt-0.5">
            Hier direkt hochladen — wir benötigen die Unterlagen, um Ihren Fall weiter zu bearbeiten.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {offenSlots.map((slot) => {
          const isUploading = uploadingSlot === slot.slot_id
          const error = errorBySlot[slot.slot_id]
          return (
            <li
              key={slot.slot_id}
              className="rounded-xl bg-white border border-amber-200 p-3 flex items-start justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-claimondo-navy">
                  {slot.label}
                  {slot.pflicht && <span className="ml-1 text-amber-700">*</span>}
                </p>
                {slot.beschreibung && (
                  <p className="text-xs text-claimondo-ondo mt-0.5">{slot.beschreibung}</p>
                )}
                {error && (
                  <p className="text-xs text-red-600 mt-1">{error}</p>
                )}
              </div>

              <button
                type="button"
                disabled={isUploading || !slot.pflichtdokument_id}
                onClick={() => triggerFilePicker(slot.slot_id)}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-claimondo-navy hover:bg-claimondo-shield text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                    Lädt …
                  </>
                ) : (
                  <>
                    <UploadIcon className="w-3.5 h-3.5" />
                    Hochladen
                  </>
                )}
              </button>

              <input
                ref={(el) => {
                  fileInputRefs.current[slot.slot_id] = el
                }}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => handleFileChange(slot, e)}
              />
            </li>
          )
        })}
      </ul>

      <p className="text-[10px] text-amber-700 flex items-center gap-1">
        <CheckCircle2Icon className="w-3 h-3" />
        Hochgeladene Dokumente sind sofort beim Sachverständigen + Kanzlei sichtbar.
      </p>
    </div>
  )
}
