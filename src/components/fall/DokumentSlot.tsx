'use client'

// AAR-Phase0 (0.1): Wiederverwendbare Drop-Zone für einen einzelnen
// Pflicht- oder Optional-Slot. Zeigt Status-Badge, Preview, Größe,
// hat Drag&Drop + File-Picker + Mobile-Kamera (`capture="environment"`).
//
// Wird in DokumentenListe (0.2), StellungnahmeCard (AAR-400),
// GutachtenCard (AAR-404) und DokumenteUebersichtCard (AAR-399) genutzt.

import { useCallback, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  UploadCloudIcon,
  CheckCircle2Icon,
  FileIcon,
  CameraIcon,
  AlertTriangleIcon,
  Loader2Icon,
} from 'lucide-react'
import { uploadDokumentToOutbox } from '@/lib/fall/upload-dokument'

export type DokumentSlotStatus =
  | 'ausstehend'
  | 'hochgeladen'
  | 'geprueft'
  | 'abgelehnt'
  | 'nachgereicht_angefordert'
  | 'optional'

type Props = {
  slotLabel: string
  fallId: string
  /** pflichtdokumente.id — wenn gesetzt, wird der Status dort mitgeführt. */
  slotId?: string | null
  /** Typ im `fall_dokumente.dokument_typ` (katalog slot_id oder freier Key). */
  dokumentTyp: string
  status?: DokumentSlotStatus
  currentFile?: { name: string; url?: string | null; size?: number | null } | null
  istPflicht?: boolean
  beschreibung?: string | null
  onUploaded?: (dokumentId: string) => void
}

const STATUS_BADGE: Record<DokumentSlotStatus, { label: string; className: string }> = {
  ausstehend: { label: 'Ausstehend', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  hochgeladen: { label: 'Hochgeladen', className: 'bg-green-50 text-green-700 border-green-200' },
  geprueft: { label: 'Geprüft', className: 'bg-[#4573A2]/10 text-[#0D1B3E] border-[#4573A2]/30' },
  abgelehnt: { label: 'Abgelehnt', className: 'bg-red-50 text-red-700 border-red-200' },
  nachgereicht_angefordert: {
    label: 'Nachzureichen',
    className: 'bg-orange-50 text-orange-700 border-orange-200',
  },
  optional: { label: 'Optional', className: 'bg-gray-50 text-gray-500 border-gray-200' },
}

const ACCEPTED = 'image/jpeg,image/png,image/webp,application/pdf'
const MAX_BYTES = 10 * 1024 * 1024

export default function DokumentSlot({
  slotLabel,
  fallId,
  slotId,
  dokumentTyp,
  status = 'ausstehend',
  currentFile,
  istPflicht = false,
  beschreibung,
  onUploaded,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const cameraRef = useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [localStatus, setLocalStatus] = useState<DokumentSlotStatus>(status)
  const [localFile, setLocalFile] = useState<Props['currentFile']>(currentFile)

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
        const result = await uploadDokumentToOutbox(fallId, slotId ?? null, file, dokumentTyp, {
          istPflicht,
        })
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

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div
      className={`rounded-xl border ${
        dragOver ? 'border-[#4573A2] bg-[#4573A2]/5' : 'border-gray-200 bg-white'
      } p-4 transition-colors`}
      onDragOver={e => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-[#0D1B3E] truncate">{slotLabel}</p>
            {istPflicht && (
              <span className="text-[10px] font-semibold text-red-600 uppercase">Pflicht</span>
            )}
          </div>
          {beschreibung && <p className="text-xs text-gray-500 mt-0.5">{beschreibung}</p>}
        </div>
        <span className={`text-[10px] font-medium px-2 py-1 rounded-full border ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {hasFile && (
        <div className="flex items-center gap-2 mb-3 text-xs text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
          <FileIcon className="w-3.5 h-3.5 text-[#4573A2] flex-shrink-0" />
          <span className="truncate flex-1">{localFile!.name}</span>
          {localStatus === 'hochgeladen' || localStatus === 'geprueft' ? (
            <CheckCircle2Icon className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
          ) : localStatus === 'abgelehnt' ? (
            <AlertTriangleIcon className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
          ) : null}
        </div>
      )}

      {canReplace && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-xs font-medium disabled:opacity-50"
          >
            {isPending ? (
              <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <UploadCloudIcon className="w-3.5 h-3.5" />
            )}
            {hasFile ? 'Ersetzen' : 'Hochladen'}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => cameraRef.current?.click()}
            className="md:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#4573A2] text-[#4573A2] text-xs font-medium disabled:opacity-50"
          >
            <CameraIcon className="w-3.5 h-3.5" />
            Foto
          </button>
          <span className="text-[10px] text-gray-400 self-center hidden md:inline">
            oder Datei hier rein ziehen
          </span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={onPickChange}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPickChange}
      />
    </div>
  )
}
