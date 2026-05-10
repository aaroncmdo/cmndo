'use client'

// CMM-33: Zentrale Pflichtdokumente-Section für alle Rollen + Onboarding.
//
// Drei Varianten — alle nutzen dasselbe Slot-Card-Layout mit Drag&Drop-
// Zone pro Slot:
//   • banner   → Click-Tile (kompakter Hinweis), Klick öffnet ein Pop-over
//                mit der vollständigen Slot-Liste (Kunde-Detail-Page).
//   • card     → Inline-Liste aller Slots (SV/KB/Admin in der Fallakte).
//   • popover  → Trigger-Button, öffnet Pop-over mit Slot-Liste (Onboarding-
//                Wizard, falls dort eingebunden).
//
// Permission-Map steuert ob die Rolle hochladen darf:
//   • kunde, kb, admin   → Drag&Drop + Klick aktiv
//   • sv, kanzlei        → read-only (SV sammelt vor Ort + reicht mit Gutachten ein)
//
// Smart-Filter-Logik (Personenschaden → Attest+Diagnosebericht etc.) lebt
// unverändert in lib/claims/data-requirements.ts; diese Component konsumiert
// nur das Output via PflichtSlotForView.

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
  ChevronRightIcon,
} from 'lucide-react'
import { uploadPflichtdokument } from '@/app/kunde/onboarding/actions'

// CMM-33: Slot-Shape den die Loader (lib/claims/pflicht-for-fall.ts +
// data-requirements.ts) ausspucken.
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
export type PflichtSectionVariant = 'banner' | 'card' | 'popover' | 'embedded'

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
        <CheckCircle2Icon className="w-3 h-3" /> {pflicht ? 'Pflicht hochgeladen' : 'Hochgeladen'}
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

// CMM-33: Slot-Card mit eingebauter Drag&Drop-Zone. Multi-File-Drop löst
// direkt sequentiellen Upload aus — keine separate Pop-over pro Slot mehr.
function SlotCard({
  slot,
  fallId,
  canUpload,
  onAfterUpload,
}: {
  slot: PflichtSlotForView
  fallId: string
  canUpload: boolean
  onAfterUpload: () => void
}) {
  const [, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; current: string | null }>({
    done: 0,
    total: 0,
    current: null,
  })
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  async function handleFiles(list: FileList | File[]) {
    if (!canUpload) return
    if (!slot.pflichtdokument_id) {
      setError('Slot noch nicht initialisiert — bitte über Onboarding-Schritt hinzufügen.')
      return
    }
    const files = Array.from(list)
    if (files.length === 0) return
    setError(null)
    setUploading(true)

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
    if (succeeded > 0) onAfterUpload()
  }

  const isErfuellt = slot.status === 'erfuellt'
  const containerClass = isErfuellt
    ? 'rounded-xl border border-emerald-200 bg-emerald-50/40 p-3'
    : 'rounded-xl border border-claimondo-border bg-claimondo-bg p-3'

  return (
    <li className={containerClass}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-claimondo-navy">
            {slot.label}
            {slot.pflicht && <span className="ml-1 text-amber-700">*</span>}
          </p>
          {slot.beschreibung && (
            <p className="text-xs text-claimondo-ondo mt-0.5">{slot.beschreibung}</p>
          )}
        </div>
        <StatusPill status={slot.status} pflicht={slot.pflicht} />
      </div>

      {/* Drop-Zone — nur wenn die Rolle hochladen darf */}
      {canUpload && (
        <div
          onClick={(e) => {
            e.stopPropagation()
            fileInputRef.current?.click()
          }}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragging(true)
          }}
          onDragLeave={(e) => {
            e.stopPropagation()
            setIsDragging(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragging(false)
            if (e.dataTransfer.files) handleFiles(e.dataTransfer.files)
          }}
          className={`rounded-lg border-2 border-dashed py-3 px-3 text-center cursor-pointer transition-colors text-xs ${
            isDragging
              ? 'border-claimondo-navy bg-claimondo-ondo/10'
              : 'border-claimondo-border bg-white hover:border-claimondo-ondo'
          } ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
        >
          {uploading ? (
            <span className="inline-flex items-center gap-1.5 text-claimondo-navy">
              <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
              Lädt … ({progress.done + 1} / {progress.total}
              {progress.current ? ` · ${progress.current}` : ''})
            </span>
          ) : (
            <span className="text-claimondo-ondo">
              <UploadIcon className="w-3.5 h-3.5 inline mr-1" />
              {isErfuellt ? 'Weitere Datei hinzufügen' : 'Datei ablegen oder klicken'}
            </span>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files)
          if (e.target) e.target.value = ''
        }}
      />

      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}

      {slot.files.length > 0 && (
        <div className="mt-2 space-y-1">
          {slot.files.map((f, i) => (
            <Link
              key={`${slot.slot_id}-${i}`}
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
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

export type PflichtdokumenteSectionProps = {
  slots: PflichtSlotForView[]
  fallId: string
  rolle: PflichtSectionRolle
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
  const router = useRouter()
  const [popoverOpen, setPopoverOpen] = useState(false)

  const canUpload = UPLOAD_ALLOWED[rolle]
  const offen = slots.filter((s) => s.status !== 'erfuellt')
  const erfuellt = slots.length - offen.length
  const offenPflicht = offen.filter((s) => s.pflicht).length

  // Banner verschwindet automatisch wenn alle Slots erfüllt sind.
  if ((variant === 'banner' || variant === 'embedded') && offen.length === 0) return null
  // Bei card / popover: nichts rendern wenn keine Slots existieren.
  if (slots.length === 0) return null

  function refreshAfterUpload() {
    router.refresh()
  }

  // ─── Slot-Liste — alle Varianten teilen sich diesen Render. ────────────
  const slotListJsx = (
    <ul className="space-y-2">
      {slots.map((slot) => (
        <SlotCard
          key={slot.slot_id}
          slot={slot}
          fallId={fallId}
          canUpload={canUpload}
          onAfterUpload={refreshAfterUpload}
        />
      ))}
    </ul>
  )

  // ─── Pop-over-Wrapper ──────────────────────────────────────────────────
  function renderPopover(headerTitle: string) {
    if (!popoverOpen) return null
    return (
      <div
        className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4"
        onClick={() => setPopoverOpen(false)}
      >
        <div
          className="w-full md:max-w-2xl bg-white rounded-t-2xl md:rounded-2xl border border-claimondo-border shadow-xl max-h-[85vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 bg-white border-b border-claimondo-border px-5 py-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-claimondo-navy">{headerTitle}</p>
              <p className="text-xs text-claimondo-ondo mt-0.5">
                {erfuellt} / {slots.length} hochgeladen ·{' '}
                {offenPflicht > 0
                  ? `${offenPflicht} Pflicht offen`
                  : offen.length > 0
                    ? `${offen.length} optional offen`
                    : 'alle erfüllt'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPopoverOpen(false)}
              className="text-claimondo-ondo/70 hover:text-claimondo-ondo shrink-0"
              aria-label="Schließen"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>
          <div className="p-5">{slotListJsx}</div>
        </div>
      </div>
    )
  }

  // ─── Banner-Variante: Click-Tile → Pop-over ────────────────────────────
  if (variant === 'banner' || variant === 'embedded') {
    const headline =
      offenPflicht > 0
        ? `${offenPflicht} Pflichtdokument${offenPflicht === 1 ? '' : 'e'} fehlen noch`
        : `${offen.length} Dokument${offen.length === 1 ? '' : 'e'} können hochgeladen werden`

    // Embedded: kein eigener border/rounded — sitzt in einem Outer-Wrapper
    // (z.B. ClaimStepper). Banner: mit eigenem Card-Style.
    const buttonCls =
      variant === 'embedded'
        ? 'w-full text-left bg-amber-50 px-4 py-3 hover:bg-amber-100/60 transition-colors'
        : 'w-full text-left rounded-2xl bg-amber-50 border border-amber-200 p-4 hover:bg-amber-100/60 hover:border-amber-300 transition-colors'

    return (
      <>
        <button type="button" onClick={() => setPopoverOpen(true)} className={buttonCls}>
          <div className="flex items-center gap-3">
            <AlertCircleIcon className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900">{title ?? headline}</p>
              <p className="text-xs text-amber-800 mt-0.5">
                Klicken zum Hochladen — Drag&Drop pro Dokument im Pop-over.
              </p>
            </div>
            <ChevronRightIcon className="w-5 h-5 text-amber-600 shrink-0" />
          </div>
        </button>
        {renderPopover(title ?? 'Pflichtdokumente')}
      </>
    )
  }

  // ─── Popover-Variante: Trigger-Button → Pop-over (Onboarding-Stil) ──────
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
        {renderPopover(title ?? 'Pflichtdokumente')}
      </>
    )
  }

  // ─── Card-Variante (Default für SV/KB/Admin): inline alle Slots ────────
  return (
    <div className="rounded-2xl bg-white border border-claimondo-border p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-claimondo-navy">{title ?? 'Pflichtdokumente'}</p>
        <span className="text-xs text-claimondo-ondo">
          {erfuellt} / {slots.length} eingegangen
        </span>
      </div>
      {slotListJsx}
    </div>
  )
}
