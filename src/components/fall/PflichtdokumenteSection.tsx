'use client'

// CMM-33: Zentrale Pflichtdokumente-Section für alle Rollen + Onboarding.
//
// Konsolidiert die alte read-only `PflichtdokumenteListe` und den
// `PflichtdokumenteUploadBanner` zu einer Component. Variant-Prop steuert
// Look (banner / card / popover). Permission-Map steuert ob die jeweilige
// Rolle hochladen darf:
//   • kunde  → Upload aktiv
//   • kb     → Upload aktiv
//   • admin  → Upload aktiv
//   • sv     → Read-only (SV sammelt vor Ort + reicht mit Gutachten ein)
//   • kanzlei → Read-only
//
// Smart-Filter-Logik (Personenschaden → Attest+Diagnosebericht, Polizei-
// vor-Ort → Polizeibericht, Sachschaden → Fotos+Rechnung, Zeugen →
// Zeugenbericht, Vorschäden → altes Gutachten/Reparaturrechnung/Kaufvertrag)
// lebt unverändert in lib/claims/data-requirements.ts; diese Component
// konsumiert nur das Output via PflichtSlotForView.

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  UploadIcon,
  Loader2Icon,
  CheckCircle2Icon,
  CircleDotIcon,
  ClockIcon,
  DownloadIcon,
  AlertCircleIcon,
  XIcon,
} from 'lucide-react'
import { uploadPflichtdokument } from '@/app/kunde/onboarding/actions'

// CMM-33: Slot-Shape den die Loader (lib/claims/pflicht-for-fall.ts +
// data-requirements.ts) ausspucken. Type lebt jetzt hier statt in der
// alten PflichtdokumenteListe-Component (die ist gelöscht).
export type PflichtSlotForView = {
  slot_id: string
  /** UUID der pflichtdokumente-Row — wird vom Upload-Pfad benötigt. Null
   *  wenn der Slot nur über Smart-Filter sichtbar ist aber noch keine
   *  pflichtdokumente-Row hat. */
  pflichtdokument_id: string | null
  label: string
  beschreibung: string
  pflicht: boolean
  status: 'offen' | 'erfuellt' | 'spaeter' | 'nicht_relevant'
  /** Hochgeladene Files — bei Multi-File mehrere; erstes = Cover. */
  files: Array<{ name: string; url: string }>
}

export type PflichtSectionRolle = 'kunde' | 'kb' | 'admin' | 'sv' | 'kanzlei'
export type PflichtSectionVariant = 'banner' | 'card' | 'popover'

const UPLOAD_ALLOWED: Record<PflichtSectionRolle, boolean> = {
  kunde: true,
  kb: true,
  admin: true,
  sv: false,
  kanzlei: false,
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function StatusPill({ status, pflicht }: { status: PflichtSlotForView['status']; pflicht: boolean }) {
  if (status === 'erfuellt') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
        <CheckCircle2Icon className="w-3 h-3" /> Hochgeladen
      </span>
    )
  }
  if (status === 'spaeter') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-claimondo-ondo/10 text-claimondo-ondo">
        <ClockIcon className="w-3 h-3" /> Später
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
      <CircleDotIcon className="w-3 h-3" />
      {pflicht ? 'Pflicht offen' : 'Offen'}
    </span>
  )
}

type SlotRowProps = {
  slot: PflichtSlotForView
  canUpload: boolean
  uploadingSlotId: string | null
  errorBySlot: Record<string, string>
  onUploadClick: (slot: PflichtSlotForView) => void
  variant: PflichtSectionVariant
}

function SlotRow({
  slot,
  canUpload,
  uploadingSlotId,
  errorBySlot,
  onUploadClick,
  variant,
}: SlotRowProps) {
  const isUploading = uploadingSlotId === slot.slot_id
  const error = errorBySlot[slot.slot_id]
  const showUploadButton = canUpload && slot.status !== 'erfuellt'

  // Banner-Look: amber Hintergrund (offene Slots)
  // Card/Popover-Look: neutraler Hintergrund (zeigt offene + erfüllte)
  const containerClass =
    variant === 'banner'
      ? 'rounded-xl bg-white border border-amber-200 p-3'
      : 'rounded-xl border border-claimondo-border bg-[#f8f9fb] p-3'

  return (
    <li className={containerClass}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-claimondo-navy">
            {slot.label}
            {slot.pflicht && <span className="ml-1 text-amber-700">*</span>}
          </p>
          {slot.beschreibung && (
            <p className="text-xs text-claimondo-ondo mt-0.5">{slot.beschreibung}</p>
          )}
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusPill status={slot.status} pflicht={slot.pflicht} />
          {showUploadButton && (
            <button
              type="button"
              disabled={isUploading || !slot.pflichtdokument_id}
              onClick={() => onUploadClick(slot)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-claimondo-navy hover:bg-claimondo-shield text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
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
          )}
        </div>
      </div>

      {slot.files.length > 0 && (
        <div className="mt-2 space-y-1">
          {slot.files.map((f, i) => (
            <Link
              key={`${slot.slot_id}-${i}`}
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-claimondo-navy hover:text-claimondo-shield bg-white border border-claimondo-border hover:border-claimondo-ondo rounded-lg px-2.5 py-1.5 transition-colors"
            >
              <DownloadIcon className="w-3.5 h-3.5" />
              <span className="truncate max-w-[16rem]">{f.name || 'Datei öffnen'}</span>
            </Link>
          ))}
        </div>
      )}
    </li>
  )
}

// CMM-33: Upload-Pop-over für einen einzelnen Slot. Öffnet sich beim
// Klick auf „Hochladen" — Multi-File via Drag&Drop oder File-Picker, plus
// Erfolgs-Feedback und Schließen ohne Page-Wechsel (= kein Sprung zum
// Onboarding mehr, alles inline).
function UploadPopover({
  slot,
  fallId,
  onClose,
  onUploaded,
}: {
  slot: PflichtSlotForView
  fallId: string
  onClose: () => void
  onUploaded: () => void
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; current: string | null }>({
    done: 0,
    total: 0,
    current: null,
  })
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ count: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  function addFiles(list: FileList | File[]) {
    const arr = Array.from(list)
    if (arr.length === 0) return
    setFiles((prev) => [...prev, ...arr])
    setError(null)
    setSuccess(null)
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleUpload() {
    if (!slot.pflichtdokument_id) {
      setError('Slot noch nicht initialisiert — bitte über Onboarding-Schritt hinzufügen.')
      return
    }
    if (files.length === 0) return
    setUploading(true)
    setError(null)
    setProgress({ done: 0, total: files.length, current: files[0]?.name ?? null })

    let succeeded = 0
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setProgress({ done: i, total: files.length, current: file.name })
      try {
        const base64 = await fileToBase64(file)
        const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
          startTransition(async () => {
            const r = await uploadPflichtdokument(
              slot.pflichtdokument_id as string,
              fallId,
              base64,
              file.name,
              file.type || 'application/octet-stream',
            )
            resolve(r)
          })
        })
        if (result.success) {
          succeeded++
        } else {
          setError(result.error ?? 'Upload fehlgeschlagen')
          break
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        break
      }
    }

    setProgress({ done: succeeded, total: files.length, current: null })
    setUploading(false)
    if (succeeded > 0) {
      setSuccess({ count: succeeded })
      setFiles([])
      router.refresh()
      onUploaded()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-lg bg-white rounded-t-2xl md:rounded-2xl border border-claimondo-border shadow-xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-claimondo-border px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-semibold text-claimondo-navy">{slot.label}</p>
            {slot.beschreibung && (
              <p className="text-xs text-claimondo-ondo mt-0.5">{slot.beschreibung}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-claimondo-ondo/70 hover:text-claimondo-ondo shrink-0"
            aria-label="Schließen"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setIsDragging(false)
              if (e.dataTransfer.files) addFiles(e.dataTransfer.files)
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-claimondo-navy bg-claimondo-ondo/5'
                : 'border-claimondo-border bg-[#f8f9fb] hover:border-claimondo-ondo'
            }`}
          >
            <UploadIcon className="w-6 h-6 mx-auto text-claimondo-ondo mb-2" />
            <p className="text-sm font-medium text-claimondo-navy">
              Datei hier ablegen oder klicken zum Auswählen
            </p>
            <p className="text-[11px] text-claimondo-ondo mt-1">
              JPG, PNG oder PDF — mehrere Dateien gleichzeitig möglich
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files)
              if (e.target) e.target.value = ''
            }}
          />

          {files.length > 0 && (
            <ul className="space-y-1.5">
              {files.map((file, i) => (
                <li
                  key={`${file.name}-${i}`}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#f8f9fb] border border-claimondo-border"
                >
                  <span className="text-xs text-claimondo-navy truncate flex-1">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    disabled={uploading}
                    className="text-claimondo-ondo/70 hover:text-red-600 shrink-0"
                    aria-label={`${file.name} entfernen`}
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {uploading && (
            <div className="rounded-lg bg-[#f8f9fb] border border-claimondo-border p-3 text-xs text-claimondo-navy flex items-center gap-2">
              <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
              Lädt … ({progress.done + 1} / {progress.total}
              {progress.current ? ` · ${progress.current}` : ''})
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
              {error}
            </div>
          )}

          {success && !uploading && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2Icon className="w-4 h-4 shrink-0" />
              {success.count} {success.count === 1 ? 'Datei' : 'Dateien'} erfolgreich hochgeladen.
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-claimondo-border px-5 py-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="px-4 py-2 rounded-lg text-sm font-medium text-claimondo-ondo hover:bg-[#f8f9fb] disabled:opacity-50"
          >
            {success ? 'Schließen' : 'Abbrechen'}
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading || files.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-claimondo-navy hover:bg-claimondo-shield text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <UploadIcon className="w-4 h-4" />
            {files.length > 1 ? `${files.length} Dateien hochladen` : 'Hochladen'}
          </button>
        </div>
      </div>
    </div>
  )
}

export type PflichtdokumenteSectionProps = {
  slots: PflichtSlotForView[]
  fallId: string
  rolle: PflichtSectionRolle
  /**
   * banner   = amber Banner mit nur offenen Slots (Kunde-Detail-Page-Stil)
   * card     = vollständige Liste mit offenen + erfüllten Slots (SV/KB/Admin)
   * popover  = Modal-Trigger; Liste in einem Pop-over (Onboarding-Stil)
   */
  variant?: PflichtSectionVariant
  /** Optionaler Section-Titel — überschreibt den variant-Default. */
  title?: string
}

export default function PflichtdokumenteSection({
  slots,
  fallId,
  rolle,
  variant = 'card',
  title,
}: PflichtdokumenteSectionProps) {
  // CMM-33: Pop-over-Upload — Klick auf „Hochladen" öffnet ein Modal mit
  // File-Drop-Zone + Multi-File + Erfolgs-Feedback. Kein Page-Wechsel,
  // kein Sprung zum Onboarding.
  const [activeSlot, setActiveSlot] = useState<PflichtSlotForView | null>(null)
  const [popoverOpen, setPopoverOpen] = useState(false)
  // errorBySlot bleibt als read-only Anzeige für Edge-Cases
  const [errorBySlot] = useState<Record<string, string>>({})

  const canUpload = UPLOAD_ALLOWED[rolle]
  const offen = slots.filter((s) => s.status !== 'erfuellt')
  const offenPflicht = offen.filter((s) => s.pflicht).length
  const visibleSlots = variant === 'banner' ? offen : slots

  // Banner verschwindet automatisch wenn alle Slots erfüllt sind.
  if (variant === 'banner' && visibleSlots.length === 0) return null
  // Bei card / popover: nichts rendern wenn keine Slots existieren.
  if (slots.length === 0) return null

  function handleSlotUploadClick(slot: PflichtSlotForView) {
    setActiveSlot(slot)
  }

  // CMM-33: Slot-Liste als Inner-Render — von allen drei Varianten genutzt.
  const slotList = (
    <ul className="space-y-2">
      {visibleSlots.map((slot) => (
        <SlotRow
          key={slot.slot_id}
          slot={slot}
          canUpload={canUpload}
          uploadingSlotId={null}
          errorBySlot={errorBySlot}
          onUploadClick={handleSlotUploadClick}
          variant={variant}
        />
      ))}
    </ul>
  )

  // Pop-over am Ende: für jeden „Hochladen"-Klick öffnet sich der Slot-
  // spezifische UploadPopover. Closing räumt activeSlot auf.
  const sharedPopover = activeSlot ? (
    <UploadPopover
      slot={activeSlot}
      fallId={fallId}
      onClose={() => setActiveSlot(null)}
      onUploaded={() => {
        // Nicht direkt schließen — User entscheidet via „Schließen"-Button,
        // damit das Erfolgs-Feedback sichtbar bleibt.
      }}
    />
  ) : null

  // ─── Banner-Variante ────────────────────────────────────────────────────
  if (variant === 'banner') {
    const headline =
      offenPflicht > 0
        ? `${offenPflicht} Pflichtdokument${offenPflicht === 1 ? '' : 'e'} fehlen noch`
        : `${offen.length} Dokument${offen.length === 1 ? '' : 'e'} können hochgeladen werden`

    return (
      <>
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircleIcon className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900">{title ?? headline}</p>
              <p className="text-xs text-amber-800 mt-0.5">
                Hier direkt hochladen — wir benötigen die Unterlagen, um Ihren Fall weiter zu bearbeiten.
              </p>
            </div>
          </div>

          {slotList}

          {canUpload && (
            <p className="text-[10px] text-amber-700 flex items-center gap-1">
              <CheckCircle2Icon className="w-3 h-3" />
              Hochgeladene Dokumente sind sofort beim Sachverständigen + Kanzlei sichtbar.
            </p>
          )}
        </div>
        {sharedPopover}
      </>
    )
  }

  // ─── Popover-Variante (Trigger-Button → Modal mit Slot-Liste) ──────────
  if (variant === 'popover') {
    const triggerLabel =
      offen.length > 0 ? `Dokumente hochladen (${offen.length} offen)` : 'Dokumente verwalten'
    return (
      <>
        <button
          type="button"
          onClick={() => setPopoverOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-claimondo-navy hover:bg-claimondo-shield text-white text-sm font-semibold"
        >
          <UploadIcon className="w-4 h-4" />
          {triggerLabel}
        </button>

        {popoverOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4"
            onClick={() => setPopoverOpen(false)}
          >
            <div
              className="w-full md:max-w-2xl bg-white rounded-t-2xl md:rounded-2xl border border-claimondo-border shadow-xl max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-white border-b border-claimondo-border px-5 py-4 flex items-center justify-between">
                <p className="text-base font-semibold text-claimondo-navy">
                  {title ?? 'Pflichtdokumente'}
                </p>
                <button
                  type="button"
                  onClick={() => setPopoverOpen(false)}
                  className="text-claimondo-ondo/70 hover:text-claimondo-ondo"
                  aria-label="Schließen"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5">{slotList}</div>
            </div>
          </div>
        )}

        {sharedPopover}
      </>
    )
  }

  // ─── Card-Variante (Default für SV/KB/Admin) ───────────────────────────
  const erfuellt = slots.length - offen.length
  return (
    <>
      <div className="rounded-2xl bg-white border border-claimondo-border p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-claimondo-navy">
            {title ?? 'Pflichtdokumente'}
          </p>
          <span className="text-xs text-claimondo-ondo">
            {erfuellt} / {slots.length} eingegangen
          </span>
        </div>
        {slotList}
      </div>
      {sharedPopover}
    </>
  )
}
