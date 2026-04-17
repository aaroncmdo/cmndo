'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { UploadCloudIcon, XIcon, CheckCircle2Icon, FileTextIcon, ClockIcon } from 'lucide-react'
import { uploadSaVorlage } from '@/lib/actions/sv-verifizierung-actions'
import { LoadingButton } from '@/components/ui/loading-button'

// AAR-359 W3: SA-Vorlage-Upload-Step im Willkommen-Wizard.
//
// Erscheint nach Stripe-Anzahlung als Step 5 für Solo + Büro-Inhaber +
// Akademie-Verwalter. Sub-Mitarbeiter sehen diesen Step NICHT — sie
// laden ihre eigene SA-Vorlage später im /gutachter/verifizierung-UI
// hoch (Build in W5).
//
// Flow:
// - SV lädt PDF (max 15 MB)
// - Server schreibt sa_vorlage_status='ausstehend' + erzeugt Admin-Task
// - Nach Upload zeigt der Step den Warte-State (Status ausstehend)
// - "Weiter zum Kalender" geht trotzdem — SA-Freigabe ist Dispatch-Gate,
//   nicht Kalender-Gate. Der SV kann also schon mit der Kalender-Connection
//   fortfahren während der Admin prüft.
// - Bei status='zurueckgewiesen' zeigen wir den Ablehnungsgrund + Re-Upload.

type Props = {
  svId: string
  initialStatus: 'ausstehend' | 'geprueft' | 'zurueckgewiesen' | null
  adminNotiz: string | null
  onDone: () => void
}

export default function SaVorlageUploadStep({ svId: _svId, initialStatus, adminNotiz, onDone }: Props) {
  const [status, setStatus] = useState<Props['initialStatus']>(initialStatus)
  const [uploaded, setUploaded] = useState(!!initialStatus && initialStatus !== 'zurueckgewiesen')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    if (file.size > 15 * 1024 * 1024) {
      setError('Datei zu groß — max 15 MB')
      return
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Nur PDF-Dateien erlaubt')
      return
    }

    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('sa_vorlage', file)
      await uploadSaVorlage(fd)
      setUploaded(true)
      setStatus('ausstehend')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
    } finally {
      setUploading(false)
    }
  }, [])

  const onDrop = useCallback((accepted: File[]) => {
    const file = accepted[0]
    if (file) handleFile(file)
  }, [handleFile])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    multiple: false,
    disabled: uploading,
  })

  function handleReset() {
    setUploaded(false)
    setStatus(null)
    setError(null)
  }

  const isRejected = status === 'zurueckgewiesen'
  const showUploadZone = !uploaded || isRejected

  return (
    <div className="space-y-5">
      {/* Header — Kontext warum SA-Vorlage */}
      <div className="bg-[#4573A2]/5 border border-[#4573A2]/20 rounded-xl p-4 flex items-start gap-3">
        <FileTextIcon className="w-5 h-5 text-[#4573A2] flex-shrink-0 mt-0.5" />
        <div className="text-sm text-[#0D1B3E]">
          <p className="font-semibold">SA-Vorlage hochladen</p>
          <p className="text-xs text-[#1E3A5F] mt-1">
            Lade eine Muster-Schadenaufnahme als PDF hoch. Claimondo prüft die
            Vorlage — erst nach Admin-Freigabe werden dir Fälle zugewiesen.
            Du kannst den Willkommen-Flow danach trotzdem abschließen.
          </p>
        </div>
      </div>

      {/* Zurückgewiesen-Banner mit Admin-Notiz */}
      {isRejected && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-red-800 mb-1">Deine Vorlage wurde zurückgewiesen</p>
          {adminNotiz && (
            <p className="text-xs text-red-700 whitespace-pre-line">
              <span className="font-medium">Grund:</span> {adminNotiz}
            </p>
          )}
          <p className="text-xs text-red-700 mt-2">Bitte lade eine überarbeitete Version hoch.</p>
        </div>
      )}

      {/* Drop-Zone ODER Warte-State je nach Status */}
      {showUploadZone ? (
        <div
          {...getRootProps()}
          className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-[#4573A2] bg-[#4573A2]/5'
              : 'border-gray-300 bg-gray-50 hover:border-[#4573A2] hover:bg-gray-100'
          } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
        >
          <input {...getInputProps()} />
          <UploadCloudIcon className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-700">
            {isDragActive ? 'Hier ablegen ...' : 'SA-Vorlage hierher ziehen oder klicken zum Auswählen'}
          </p>
          <p className="text-[11px] text-gray-500 mt-1">Nur PDF — max 15 MB</p>
          {uploading && (
            <p className="text-xs text-[#4573A2] mt-3">Wird hochgeladen ...</p>
          )}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl border border-gray-200 bg-white flex items-center justify-center">
                <FileTextIcon className="w-6 h-6 text-[#4573A2]" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                  {status === 'geprueft' ? (
                    <>
                      <CheckCircle2Icon className="w-4 h-4 text-emerald-600" />
                      SA-Vorlage freigegeben
                    </>
                  ) : (
                    <>
                      <ClockIcon className="w-4 h-4 text-amber-600" />
                      Wird geprüft
                    </>
                  )}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {status === 'geprueft'
                    ? 'Dispatch-Gate geöffnet — du erhältst bald deine ersten Fälle.'
                    : 'Claimondo prüft deine Vorlage. Du wirst per Email benachrichtigt.'}
                </p>
              </div>
            </div>
            {status !== 'geprueft' && (
              <button
                type="button"
                onClick={handleReset}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Andere Datei wählen"
              >
                <XIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Button: immer "Weiter" nach Upload, keine Skip-Option (Pflicht!) */}
      <div className="flex items-center gap-3">
        <LoadingButton
          isLoading={uploading}
          loadingText="Wird hochgeladen ..."
          onClick={onDone}
          disabled={!uploaded || isRejected}
          className="flex-1 py-2.5 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {!uploaded || isRejected ? 'Bitte zuerst SA-Vorlage hochladen' : 'Weiter zum Kalender'}
        </LoadingButton>
      </div>

      <p className="text-[11px] text-gray-400 text-center">
        Du kannst deine SA-Vorlage später unter Profil → Verifizierung ersetzen
      </p>
    </div>
  )
}
