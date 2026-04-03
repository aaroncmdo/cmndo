'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { uploadPflichtdokument, completeOnboarding } from './actions'

type Pflichtdokument = {
  id: string
  titel: string
  beschreibung: string | null
  pflicht: boolean
  status: string
  datei_url: string | null
  datei_name: string | null
}

type ExistingDoc = {
  id: string
  typ: string
  datei_url: string
  datei_name: string | null
}

export default function OnboardingClient({
  fallId,
  fallNummer,
  svTermin,
  pflichtdokumente,
  existingDocs,
}: {
  fallId: string
  fallNummer: string | null
  svTermin: string | null
  pflichtdokumente: Pflichtdokument[]
  existingDocs: ExistingDoc[]
}) {
  const router = useRouter()
  const [docs, setDocs] = useState(pflichtdokumente)
  const [completing, setCompleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pflicht = docs.filter(d => d.pflicht)
  const optional = docs.filter(d => !d.pflicht)
  const uploadedCount = pflicht.filter(d => d.status === 'hochgeladen').length
  const totalPflicht = pflicht.length
  const allPflichtDone = totalPflicht === 0 || uploadedCount === totalPflicht
  const progress = totalPflicht > 0 ? Math.round((uploadedCount / totalPflicht) * 100) : 100

  // Check if Gutachtertermin is within 48h
  const svTerminSoon = svTermin ? isWithin48h(svTermin) : false
  const docsStillMissing = pflicht.some(d => d.status === 'ausstehend')

  async function handleComplete() {
    setCompleting(true)
    setError(null)
    try {
      const result = await completeOnboarding(fallId)
      if (result?.success) {
        toast.success('Onboarding abgeschlossen!')
        router.push('/kunde')
      } else {
        const msg = result?.error ?? 'Fehler beim Abschliessen'
        setError(msg)
        toast.error(msg)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Fehler beim Abschliessen'
      setError(msg)
      toast.error(msg)
    } finally {
      setCompleting(false)
    }
  }

  function handleDocUploaded(docId: string, dateiUrl: string, dateiName: string) {
    setDocs(prev => prev.map(d =>
      d.id === docId
        ? { ...d, status: 'hochgeladen', datei_url: dateiUrl, datei_name: dateiName }
        : d
    ))
  }

  return (
    <div className="px-4 py-8">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">Onboarding</h1>
          <p className="text-gray-500 text-sm">
            Fall {fallNummer ?? fallId.slice(0, 8)} - Bitte laden Sie die erforderlichen Dokumente hoch.
          </p>
        </div>

        {/* Progress bar */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Fortschritt</span>
            <span className="text-gray-700 text-sm font-medium">{uploadedCount} von {totalPflicht} Dokumente</span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#4573A2] rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Urgent banner: Gutachtertermin < 48h */}
        {svTerminSoon && docsStillMissing && (
          <div className="bg-amber-50/50 border border-amber-800 rounded-2xl p-4 mb-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <p className="text-amber-300 text-sm font-medium">Gutachtertermin in weniger als 48 Stunden!</p>
              <p className="text-amber-400/70 text-xs mt-0.5">
                Bitte laden Sie alle fehlenden Dokumente so schnell wie moglich hoch.
              </p>
            </div>
          </div>
        )}

        {/* Already uploaded flow docs */}
        {existingDocs.length > 0 && (
          <div className="bg-white rounded-2xl p-5 border border-gray-200 mb-4">
            <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">
              Bereits hochgeladene Dokumente
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {existingDocs.map(doc => (
                <div key={doc.id} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                  {doc.typ.startsWith('foto') ? (
                    <img src={doc.datei_url} alt={doc.datei_name ?? ''} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-gray-500">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-green-500/10 flex items-end">
                    <div className="w-full bg-green-900/80 px-2 py-1">
                      <span className="text-green-300 text-[10px] font-medium flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        Erledigt
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pflichtdokumente */}
        {pflicht.length > 0 && (
          <div className="space-y-3 mb-4">
            <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider">
              Pflichtdokumente
            </h3>
            {pflicht.map(doc => (
              <DokumentCard
                key={doc.id}
                doc={doc}
                fallId={fallId}
                onUploaded={handleDocUploaded}
              />
            ))}
          </div>
        )}

        {/* Optional documents */}
        {optional.length > 0 && (
          <div className="space-y-3 mb-6">
            <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider">
              Optionale Dokumente
            </h3>
            {optional.map(doc => (
              <DokumentCard
                key={doc.id}
                doc={doc}
                fallId={fallId}
                onUploaded={handleDocUploaded}
              />
            ))}
            <p className="text-gray-400 text-xs">Optionale Dokumente konnen ubersprungen werden.</p>
          </div>
        )}

        {/* No pflichtdokumente → can complete immediately */}
        {pflicht.length === 0 && optional.length === 0 && (
          <div className="bg-white rounded-2xl p-8 border border-gray-200 mb-4 text-center">
            <div className="text-green-400 text-3xl mb-3">
              <svg className="w-10 h-10 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-gray-900 font-medium mb-1">Alle Dokumente vorhanden</h3>
            <p className="text-gray-500 text-sm">Sie konnen das Onboarding jetzt abschliessen.</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-sm text-red-400 text-center rounded-2xl bg-red-500/10 border border-red-900/50 px-4 py-3 mb-4">
            {error}
          </p>
        )}

        {/* Complete button */}
        <button
          onClick={handleComplete}
          disabled={!allPflichtDone || completing}
          className="w-full py-4 rounded-2xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white font-semibold text-base disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
        >
          {completing ? 'Wird abgeschlossen...' : 'Onboarding abschliessen'}
        </button>
        {!allPflichtDone && (
          <p className="text-gray-400 text-xs text-center mt-2">
            Bitte laden Sie alle Pflichtdokumente hoch, um fortzufahren.
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Document Card ───────────────────────────────────────────────────────────

function DokumentCard({
  doc,
  fallId,
  onUploaded,
}: {
  doc: Pflichtdokument
  fallId: string
  onUploaded: (docId: string, dateiUrl: string, dateiName: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const isUploaded = doc.status === 'hochgeladen'

  async function handleFile(file: File) {
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const result = await uploadPflichtdokument(fallId, doc.id, formData)
      onUploaded(doc.id, result.dateiUrl, result.dateiName)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
    } finally {
      setUploading(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div className={`bg-white rounded-2xl p-5 border transition-colors ${
      isUploaded ? 'border-green-800/50' : 'border-gray-200'
    }`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-gray-900 text-sm font-medium">{doc.titel}</h4>
            {doc.pflicht ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-medium">Pflicht</span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-gray-500 font-medium">Optional</span>
            )}
          </div>
          {doc.beschreibung && (
            <p className="text-gray-500 text-xs mt-1">{doc.beschreibung}</p>
          )}
        </div>
        {/* Status badge */}
        <div className={`shrink-0 ml-3 px-2.5 py-1 rounded-lg text-xs font-medium ${
          isUploaded
            ? 'bg-green-500/20 text-green-400'
            : 'bg-gray-100 text-gray-500'
        }`}>
          {isUploaded ? 'Hochgeladen' : 'Ausstehend'}
        </div>
      </div>

      {isUploaded ? (
        <div className="flex items-center gap-2 mt-3 px-3 py-2 bg-gray-100/50 rounded-xl">
          <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          <span className="text-gray-700 text-xs truncate">{doc.datei_name}</span>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileRef.current?.click()}
          className={`mt-3 flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
            dragOver
              ? 'border-[#4573A2] bg-[#4573A2]/5'
              : 'border-gray-300 bg-gray-100/30 hover:border-gray-300'
          }`}
        >
          {uploading ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-[#4573A2] border-t-transparent rounded-full animate-spin" />
              <span className="text-gray-500 text-sm">Wird hochgeladen...</span>
            </div>
          ) : (
            <>
              <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-gray-500 text-xs text-center">
                Datei hierher ziehen oder klicken
              </p>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx"
            capture="environment"
            onChange={handleFileInput}
            className="hidden"
          />
        </div>
      )}

      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isWithin48h(dateStr: string): boolean {
  const termin = new Date(dateStr)
  const now = new Date()
  const diff = termin.getTime() - now.getTime()
  return diff > 0 && diff < 48 * 60 * 60 * 1000
}
