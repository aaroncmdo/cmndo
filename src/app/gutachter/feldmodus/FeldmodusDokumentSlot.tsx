'use client'

// AAR-386: Feldmodus-Variant des DokumentSlot mit in-app-Kamera (KameraModal).
// Unterscheidet sich vom shared `DokumentSlot` nur in einem Punkt: der
// Foto-Button öffnet eine In-App-Kamera (Live-Preview + Retake), statt den
// nativen File-Picker mit `capture='environment'` auszulösen. Hintergrund:
// der native Picker backgroundet die PWA auf iOS/Android — in-app bleibt
// der Fokus-Modus-Kontext erhalten.
//
// File-Picker-Button bleibt erhalten als Fallback (z. B. wenn der Nutzer
// ein vorhandenes Foto aus der Galerie picken will, oder ein PDF).

import { useCallback, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangleIcon,
  CameraIcon,
  CheckCircle2Icon,
  FileIcon,
  Loader2Icon,
  UploadCloudIcon,
} from 'lucide-react'
import type { DokumentSlotStatus } from '@/components/fall/DokumentSlot'
import { uploadDokumentToOutbox } from '@/lib/fall/upload-dokument'
import KameraModal from './KameraModal'

type Props = {
  slotLabel: string
  fallId: string
  slotId: string | null
  dokumentTyp: string
  status: DokumentSlotStatus
  currentFile: { name: string; url?: string | null; size?: number | null } | null
  istPflicht: boolean
  beschreibung?: string | null
  onUploaded?: (dokumentId: string) => void
}

const STATUS_BADGE: Record<DokumentSlotStatus, { label: string; className: string }> = {
  ausstehend: { label: 'Ausstehend', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  hochgeladen: { label: 'Hochgeladen', className: 'bg-green-50 text-green-700 border-green-200' },
  geprueft: { label: 'Geprüft', className: 'bg-[var(--brand-secondary)]/10 text-[var(--brand-primary)] border-[var(--brand-secondary)]/30' },
  abgelehnt: { label: 'Abgelehnt', className: 'bg-red-50 text-red-700 border-red-200' },
  nachgereicht_angefordert: {
    label: 'Nachzureichen',
    className: 'bg-orange-50 text-orange-700 border-orange-200',
  },
  optional: { label: 'Optional', className: 'bg-claimondo-bg text-claimondo-ondo border-claimondo-border' },
}

const ACCEPTED = 'image/jpeg,image/png,image/webp,application/pdf'
const MAX_BYTES = 10 * 1024 * 1024

export default function FeldmodusDokumentSlot({
  slotLabel,
  fallId,
  slotId,
  dokumentTyp,
  status,
  currentFile,
  istPflicht,
  beschreibung,
  onUploaded,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isPending, startTransition] = useTransition()
  const [localStatus, setLocalStatus] = useState<DokumentSlotStatus>(status)
  const [localFile, setLocalFile] = useState<Props['currentFile']>(currentFile)
  const [kameraOpen, setKameraOpen] = useState(false)

  const badge = STATUS_BADGE[localStatus] ?? STATUS_BADGE.ausstehend
  const hasFile = !!localFile?.name
  const canReplace = localStatus !== 'geprueft'

  const handleFile = useCallback(
    (file: File) => {
      if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
        toast.error('Nur JPG, PNG, WebP oder PDF erlaubt')
        return
      }
      if (file.size > MAX_BYTES) {
        toast.error('Datei zu groß (max 10 MB)')
        return
      }
      startTransition(async () => {
        const result = await uploadDokumentToOutbox(
          fallId,
          slotId ?? null,
          file,
          dokumentTyp,
          { istPflicht },
        )
        if (result.ok) {
          setLocalStatus('hochgeladen')
          setLocalFile({ name: file.name, size: file.size })
          toast.success(`${slotLabel} hochgeladen`)
          onUploaded?.(result.dokumentId)
        } else {
          toast.error(result.error)
        }
      })
    },
    [fallId, slotId, dokumentTyp, slotLabel, istPflicht, onUploaded],
  )

  const onPickChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const handleKameraUploaded = (dokumentId: string) => {
    setLocalStatus('hochgeladen')
    setLocalFile({ name: `${dokumentTyp}.jpg` })
    onUploaded?.(dokumentId)
  }

  return (
    <div className="rounded-ios-xl border border-claimondo-border bg-white p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-[var(--brand-primary)] truncate">{slotLabel}</p>
            {istPflicht && (
              <span className="text-[10px] font-semibold text-red-600 uppercase">Pflicht</span>
            )}
          </div>
          {beschreibung && <p className="text-xs text-claimondo-ondo mt-0.5">{beschreibung}</p>}
        </div>
        <span className={`text-[10px] font-medium px-2 py-1 rounded-full border ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {hasFile && (
        <div className="flex items-center gap-2 mb-3 text-xs text-claimondo-navy bg-claimondo-bg rounded-ios-lg px-3 py-2">
          <FileIcon className="w-3.5 h-3.5 text-[var(--brand-secondary)] flex-shrink-0" />
          <span className="truncate flex-1">{localFile!.name}</span>
          {localStatus === 'hochgeladen' || localStatus === 'geprueft' ? (
            <CheckCircle2Icon className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
          ) : localStatus === 'abgelehnt' ? (
            <AlertTriangleIcon className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
          ) : null}
        </div>
      )}

      {canReplace && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => setKameraOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-ios-lg bg-[var(--brand-primary)] hover:bg-[var(--brand-secondary)] text-white text-xs font-medium disabled:opacity-50"
          >
            <CameraIcon className="w-3.5 h-3.5" />
            Foto
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-ios-lg border border-[var(--brand-secondary)] text-[var(--brand-secondary)] text-xs font-medium disabled:opacity-50"
          >
            {isPending ? (
              <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <UploadCloudIcon className="w-3.5 h-3.5" />
            )}
            Datei
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={onPickChange}
      />

      <KameraModal
        open={kameraOpen}
        fallId={fallId}
        slotId={slotId}
        dokumentTyp={dokumentTyp}
        slotLabel={slotLabel}
        istPflicht={istPflicht}
        onClose={() => setKameraOpen(false)}
        onUploaded={handleKameraUploaded}
      />
    </div>
  )
}
