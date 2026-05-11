'use client'

// AAR-714: Multi-Doc-Upload-Step im SV-Willkommen-Wizard.
//
// Ersetzt den früheren SaVorlageUploadStep (ein PDF) durch einen Step mit
// vier Slots, gruppiert in zwei Blöcke:
//
//   Block 1 (ODER-Wahl, mindestens einer Pflicht):
//     - sv_sicherungsabtretung
//     - sv_honorarvereinbarung
//   Block 2 (beide Pflicht):
//     - sv_datenschutzerklaerung
//     - sv_widerrufsbelehrung
//
// Alle Uploads gehen über die bestehende uploadSvPflichtdokument-Action,
// die den Eintrag in pflichtdokumente schreibt und einen Admin-Review-
// Task erzeugt. Sobald der Admin im VerifizierungsTab alle Dokumente
// freigibt, setzt dokumenteFreigeben() sachverstaendige.verifiziert=true.

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { UploadCloudIcon, CheckCircle2Icon, FileTextIcon, ClockIcon, AlertCircleIcon } from 'lucide-react'
import { uploadSvPflichtdokument } from '@/lib/actions/sv-verifizierung-actions'
import { LoadingButton } from '@/components/ui/loading-button'

export type DokumentSlotStatus = 'leer' | 'hochgeladen' | 'geprueft' | 'abgelehnt'

export type DokumentSlotState = {
  slotId: string
  status: DokumentSlotStatus
  adminNotiz?: string | null
}

type Props = {
  initialSlots: DokumentSlotState[]
  onDone: () => void
}

type SlotDef = {
  slotId: string
  label: string
  beschreibung: string
}

const GRUPPE_ABTRETUNG: SlotDef[] = [
  {
    slotId: 'sv_sicherungsabtretung',
    label: 'Sicherungsabtretung',
    beschreibung: 'Dein Standard-Formular für die Abtretung des Schadenersatzanspruchs.',
  },
  {
    slotId: 'sv_honorarvereinbarung',
    label: 'Honorarvereinbarung',
    beschreibung: 'Alternativ zur Sicherungsabtretung — eines von beiden reicht.',
  },
]

const GRUPPE_PFLICHT: SlotDef[] = [
  {
    slotId: 'sv_datenschutzerklaerung',
    label: 'Datenschutzerklärung',
    beschreibung: 'Deine Datenschutzerklärung für Endkunden.',
  },
  {
    slotId: 'sv_widerrufsbelehrung',
    label: 'Widerrufsbelehrung',
    beschreibung: 'Widerrufsbelehrung nach §§ 312g, 355 BGB.',
  },
]

const MAX_MB = 15
const MAX_BYTES = MAX_MB * 1024 * 1024
const ACCEPT = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
}

export default function DokumenteUploadStep({ initialSlots, onDone }: Props) {
  const [slots, setSlots] = useState<Record<string, DokumentSlotState>>(() => {
    const map: Record<string, DokumentSlotState> = {}
    for (const s of initialSlots) map[s.slotId] = s
    return map
  })
  const [uploading, setUploading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const setSlot = useCallback((slotId: string, next: DokumentSlotState) => {
    setSlots((prev) => ({ ...prev, [slotId]: next }))
  }, [])

  const handleUpload = useCallback(
    async (slotId: string, file: File) => {
      setError(null)
      if (file.size > MAX_BYTES) {
        setError(`Datei zu groß — max ${MAX_MB} MB`)
        return
      }
      setUploading(slotId)
      try {
        const fd = new FormData()
        fd.append('slot_id', slotId)
        fd.append('datei', file)
        await uploadSvPflichtdokument(fd)
        setSlot(slotId, { slotId, status: 'hochgeladen', adminNotiz: null })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
      } finally {
        setUploading(null)
      }
    },
    [setSlot],
  )

  const hatAbtretung =
    isFilled(slots['sv_sicherungsabtretung']) || isFilled(slots['sv_honorarvereinbarung'])
  const hatDatenschutz = isFilled(slots['sv_datenschutzerklaerung'])
  const hatWiderruf = isFilled(slots['sv_widerrufsbelehrung'])
  const kannWeiter = hatAbtretung && hatDatenschutz && hatWiderruf

  return (
    <div className="space-y-6">
      {/* Header + Subtitle */}
      <div className="bg-claimondo-ondo/5 border border-claimondo-ondo/20 rounded-xl p-4 flex items-start gap-3">
        <FileTextIcon className="w-5 h-5 text-claimondo-ondo flex-shrink-0 mt-0.5" />
        <div className="text-sm text-claimondo-navy">
          <p className="font-semibold">Dokumente hochladen</p>
          <p className="text-xs text-claimondo-shield mt-1">
            Wir benötigen ihre Sicherungsabtretung oder Honorarvereinbarung, ihre
            Datenschutzerklärung und ihre Widerrufsbelehrung.
          </p>
        </div>
      </div>

      {/* Block 1 — ODER-Wahl */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-claimondo-navy">
            Sicherungsabtretung <span className="text-claimondo-ondo/70 font-normal">oder</span> Honorarvereinbarung
          </h3>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full ${
              hatAbtretung
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}
          >
            {hatAbtretung ? 'erledigt' : 'eines von beiden'}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {GRUPPE_ABTRETUNG.map((def) => (
            <SlotTile
              key={def.slotId}
              def={def}
              state={slots[def.slotId]}
              uploading={uploading === def.slotId}
              onUpload={(file) => handleUpload(def.slotId, file)}
            />
          ))}
        </div>
      </section>

      {/* Block 2 — Pflicht */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-claimondo-navy">Weitere Pflichtdokumente</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {GRUPPE_PFLICHT.map((def) => (
            <SlotTile
              key={def.slotId}
              def={def}
              state={slots[def.slotId]}
              uploading={uploading === def.slotId}
              onUpload={(file) => handleUpload(def.slotId, file)}
            />
          ))}
        </div>
      </section>

      {error && (
        <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm flex items-start gap-2">
          <AlertCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <LoadingButton
          isLoading={uploading !== null}
          loadingText="Upload läuft ..."
          onClick={onDone}
          disabled={!kannWeiter}
          className="flex-1 py-2.5 rounded-xl bg-claimondo-shield hover:bg-claimondo-ondo text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {kannWeiter ? 'Weiter zum Kalender' : 'Bitte alle Pflichtdokumente hochladen'}
        </LoadingButton>
      </div>

      <p className="text-[11px] text-claimondo-ondo/70 text-center">
        Die Dokumente werden von Claimondo geprüft. Du kannst sie später unter Profil → Verifizierung ersetzen.
      </p>
    </div>
  )
}

function isFilled(state?: DokumentSlotState): boolean {
  if (!state) return false
  return state.status === 'hochgeladen' || state.status === 'geprueft'
}

function SlotTile({
  def,
  state,
  uploading,
  onUpload,
}: {
  def: SlotDef
  state?: DokumentSlotState
  uploading: boolean
  onUpload: (file: File) => void
}) {
  const status = state?.status ?? 'leer'
  const onDrop = useCallback(
    (accepted: File[]) => {
      const file = accepted[0]
      if (file) onUpload(file)
    },
    [onUpload],
  )
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxFiles: 1,
    multiple: false,
    disabled: uploading,
  })

  const istAbgelehnt = status === 'abgelehnt'
  const istFrisch = status === 'hochgeladen' || status === 'geprueft'

  if (istFrisch) {
    const istGeprueft = status === 'geprueft'
    return (
      <div className="border border-claimondo-border rounded-xl p-4 bg-white">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg border border-claimondo-border bg-claimondo-bg flex items-center justify-center flex-shrink-0">
            <FileTextIcon className="w-5 h-5 text-claimondo-ondo" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-claimondo-navy truncate">{def.label}</p>
            <p className="text-[11px] text-claimondo-ondo flex items-center gap-1 mt-0.5">
              {istGeprueft ? (
                <>
                  <CheckCircle2Icon className="w-3.5 h-3.5 text-emerald-600" />
                  freigegeben
                </>
              ) : (
                <>
                  <ClockIcon className="w-3.5 h-3.5 text-amber-600" />
                  wird geprüft
                </>
              )}
            </p>
          </div>
          {!istGeprueft && (
            <button
              type="button"
              onClick={() => document.getElementById(`reupload-${def.slotId}`)?.click()}
              className="text-[11px] text-claimondo-ondo hover:underline flex-shrink-0"
            >
              Ersetzen
            </button>
          )}
          <input
            id={`reupload-${def.slotId}`}
            type="file"
            className="hidden"
            accept="application/pdf,image/jpeg,image/png"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onUpload(file)
              e.target.value = ''
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div
      {...getRootProps()}
      className={`relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
        isDragActive
          ? 'border-claimondo-ondo bg-claimondo-ondo/5'
          : istAbgelehnt
            ? 'border-red-300 bg-red-50 hover:bg-red-100'
            : 'border-claimondo-border bg-claimondo-bg hover:border-claimondo-ondo hover:bg-claimondo-bg'
      } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
    >
      <input {...getInputProps()} />
      <UploadCloudIcon
        className={`w-7 h-7 mx-auto mb-1.5 ${istAbgelehnt ? 'text-red-500' : 'text-claimondo-ondo/70'}`}
      />
      <p className="text-xs font-medium text-claimondo-navy">{def.label}</p>
      <p className="text-[10px] text-claimondo-ondo mt-0.5 line-clamp-2">{def.beschreibung}</p>
      <p className="text-[10px] text-claimondo-ondo/70 mt-1">PDF, JPG, PNG · max {MAX_MB} MB</p>
      {uploading && <p className="text-[11px] text-claimondo-ondo mt-1.5">Wird hochgeladen ...</p>}
      {istAbgelehnt && state?.adminNotiz && (
        <p className="text-[10px] text-red-700 mt-1.5 font-medium">
          Abgelehnt: {state.adminNotiz}
        </p>
      )}
    </div>
  )
}
