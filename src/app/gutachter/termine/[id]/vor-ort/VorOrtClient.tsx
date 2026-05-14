'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  CameraIcon, CheckCircleIcon, FileTextIcon, AlertTriangleIcon,
  ChevronDownIcon, ClipboardListIcon, XIcon,
} from 'lucide-react'
import { completeBegutachtung } from '@/lib/termine/actions'

// KFZ-200: Vor-Ort-Modus Client-Component.

const PFLICHTDOKUMENTE = [
  { key: 'fahrzeugschein', label: 'Fahrzeugschein (Vorderseite)', required: true },
  { key: 'fahrzeugschein_rueck', label: 'Fahrzeugschein (Rückseite)', required: true },
  { key: 'schadensfoto_front', label: 'Schaden-Foto vorne', required: true },
  { key: 'schadensfoto_seite', label: 'Schaden-Foto Seite', required: true },
  { key: 'schadensfoto_detail', label: 'Schaden-Detailfoto', required: true },
  { key: 'gesamtfoto', label: 'Fahrzeug-Gesamtfoto', required: true },
  { key: 'km_stand', label: 'Kilometerstand', required: false },
  { key: 'vin_nummer', label: 'FIN / VIN-Nummer', required: false },
]

const SCHADEN_POSITIONEN = [
  'Vorderkotflügel links', 'Vorderkotflügel rechts',
  'Stoßstange vorne', 'Stoßstange hinten',
  'Motorhaube', 'Kofferraumdeckel',
  'Fahrertür', 'Beifahrertür',
  'Hintere Tür links', 'Hintere Tür rechts',
  'Seitenschweller links', 'Seitenschweller rechts',
  'Dach', 'Heckklappe',
  'Hinterkotflügel links', 'Hinterkotflügel rechts',
  'Sonstiges',
]

const NOTIZEN_TAGS = [
  'Hagelschaden', 'Totalschaden-Verdacht', 'Vorschäden vorhanden',
  'Reparierbar', 'Feuchtigkeit erkannt', 'Airbag ausgelöst',
  'Unfallschaden', 'Diebstahlschaden', 'Vandalismusschaden',
]

type DokumentRow = {
  id: string
  dokument_typ: string
  dateiname: string | null
  erstellt_am: string
  discrepancy_flag: boolean
}

interface Props {
  terminId: string
  fallId: string
  fallNummer: string
  leadName: string
  leadVorname: string
  fahrzeug: string | null
  kennzeichen: string | null
  kundeDokumente: DokumentRow[]
  svDokumente: DokumentRow[]
  alreadyDone: boolean
}

export default function VorOrtClient({
  terminId,
  fallId,
  fallNummer,
  leadName,
  fahrzeug,
  kennzeichen,
  kundeDokumente,
  svDokumente,
  alreadyDone,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [notizen, setNotizen] = useState('')
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState<string | null>(null)
  const [uploadedDocs, setUploadedDocs] = useState<Map<string, string>>(
    new Map(svDokumente.map(d => [d.dokument_typ, d.id]))
  )
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({})
  const [schadenPositions, setSchadenPositions] = useState<Record<string, string>>({})
  const [confirmModal, setConfirmModal] = useState(false)
  const [done, setDone] = useState(alreadyDone)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const completedRequired = PFLICHTDOKUMENTE.filter(d => d.required && uploadedDocs.has(d.key)).length
  const totalRequired = PFLICHTDOKUMENTE.filter(d => d.required).length
  const progressPct = Math.round((completedRequired / totalRequired) * 100)

  function toggleTag(tag: string) {
    setSelectedTags(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  async function handleFileUpload(docKey: string, file: File) {
    setUploading(docKey)
    setUploadErrors(prev => ({ ...prev, [docKey]: '' }))
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('terminId', terminId)
      formData.append('fallId', fallId)
      formData.append('dokumentTyp', docKey)
      formData.append('schadenPosition', schadenPositions[docKey] ?? '')

      const res = await fetch('/api/sv/upload-with-ocr', {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()
      if (json.documentId) {
        setUploadedDocs(prev => new Map(prev).set(docKey, json.documentId))
      } else {
        setUploadErrors(prev => ({ ...prev, [docKey]: json.error ?? 'Upload fehlgeschlagen' }))
      }
    } catch (err) {
      setUploadErrors(prev => ({ ...prev, [docKey]: 'Netzwerkfehler' }))
    } finally {
      setUploading(null)
    }
  }

  function handleCameraClick(docKey: string) {
    const input = fileInputRefs.current[docKey]
    if (input) input.click()
  }

  function handleComplete() {
    const fullNotizen = [notizen, selectedTags.size ? `Tags: ${Array.from(selectedTags).join(', ')}` : '']
      .filter(Boolean).join('\n')

    startTransition(async () => {
      const res = await completeBegutachtung(terminId, fullNotizen || undefined)
      if (res.success) {
        setDone(true)
        setConfirmModal(false)
        setTimeout(() => router.push('/gutachter/termine'), 2000)
      }
    })
  }

  if (done) {
    return (
      <div className="fixed inset-0 bg-emerald-600 flex flex-col items-center justify-center gap-4 z-50">
        <CheckCircleIcon className="w-16 h-16 text-white" />
        <p className="text-2xl font-bold text-white">Begutachtung abgeschlossen!</p>
        <p className="text-white/80 text-sm">Vielen Dank. Weiterleitung...</p>
      </div>
    )
  }

  return (
    <div className="pb-32">
      {/* Header */}
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <Link href={`/gutachter/termine/${terminId}`} className="text-sm text-[var(--brand-secondary)] hover:underline">← Termin</Link>
        </div>
        <h1 className="text-xl font-bold text-claimondo-navy">Vor-Ort-Modus</h1>
        <p className="text-sm text-claimondo-ondo">{leadName} · {fahrzeug || kennzeichen || fallNummer}</p>
      </div>

      {/* Section 1: Vom Kunden erhalten */}
      <div className="px-4 mb-6">
        <h2 className="text-xs font-semibold text-claimondo-ondo/70 uppercase tracking-wide mb-3">
          Vom Kunden bereits erhalten
        </h2>
        {kundeDokumente.length === 0 ? (
          <div className="bg-claimondo-bg border border-claimondo-border rounded-ios-xl p-4 text-sm text-claimondo-ondo text-center">
            Keine Dokumente vom Kunden vorhanden.
          </div>
        ) : (
          <div className="space-y-2">
            {kundeDokumente.map(doc => (
              <div key={doc.id} className={`flex items-center gap-3 bg-white border rounded-ios-xl p-3 ${doc.discrepancy_flag ? 'border-amber-300 bg-amber-50' : 'border-claimondo-border'}`}>
                <FileTextIcon className="w-4 h-4 text-claimondo-ondo/70 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-claimondo-navy truncate">{doc.dokument_typ}</p>
                  {doc.dateiname && <p className="text-xs text-claimondo-ondo/70 truncate">{doc.dateiname}</p>}
                </div>
                {doc.discrepancy_flag && (
                  <AlertTriangleIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
                )}
                <CheckCircleIcon className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Pflichtdokumente Checklist */}
      <div className="px-4 mb-6">
        <h2 className="text-xs font-semibold text-claimondo-ondo/70 uppercase tracking-wide mb-3">
          Pflichtdokumente aufnehmen
        </h2>
        <div className="space-y-3">
          {PFLICHTDOKUMENTE.map(doc => {
            const isDone = uploadedDocs.has(doc.key)
            const isUploading = uploading === doc.key
            return (
              <div key={doc.key} className={`bg-white border rounded-ios-xl p-3 ${isDone ? 'border-emerald-200' : doc.required ? 'border-claimondo-border' : 'border-claimondo-border'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isDone ? 'bg-emerald-100' : 'bg-claimondo-bg'}`}>
                    {isDone ? (
                      <CheckCircleIcon className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <CameraIcon className="w-4 h-4 text-claimondo-ondo/70" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-claimondo-navy">
                      {doc.label}
                      {doc.required && !isDone && <span className="text-red-500 ml-1">*</span>}
                    </p>
                    {uploadErrors[doc.key] && (
                      <p className="text-xs text-red-500">{uploadErrors[doc.key]}</p>
                    )}
                  </div>
                  {!isDone && (
                    <button
                      onClick={() => handleCameraClick(doc.key)}
                      disabled={isUploading}
                      className="flex items-center gap-1.5 bg-[var(--brand-secondary)] hover:bg-claimondo-shield text-white rounded-ios-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                    >
                      <CameraIcon className="w-3.5 h-3.5" />
                      {isUploading ? 'Lädt...' : 'Aufnehmen'}
                    </button>
                  )}
                </div>

                {/* Schaden-Position Dropdown for damage photos */}
                {(doc.key.startsWith('schadensfoto') || doc.key === 'schadensfoto_detail') && (
                  <div className="mt-2 pl-11">
                    <div className="relative">
                      <select
                        value={schadenPositions[doc.key] ?? ''}
                        onChange={e => setSchadenPositions(prev => ({ ...prev, [doc.key]: e.target.value }))}
                        className="w-full text-xs border border-claimondo-border rounded-ios-lg px-2 py-1.5 appearance-none bg-claimondo-bg focus:outline-none focus:border-[var(--brand-secondary)]"
                      >
                        <option value="">Schaden-Position wählen...</option>
                        {SCHADEN_POSITIONEN.map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                      <ChevronDownIcon className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-claimondo-ondo/70 pointer-events-none" />
                    </div>
                  </div>
                )}

                {/* Hidden file input */}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  ref={el => { fileInputRefs.current[doc.key] = el }}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleFileUpload(doc.key, file)
                    e.target.value = ''
                  }}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* Section 3: SV-Notizen */}
      <div className="px-4 mb-6">
        <h2 className="text-xs font-semibold text-claimondo-ondo/70 uppercase tracking-wide mb-3">
          SV-Notizen
        </h2>
        <textarea
          value={notizen}
          onChange={e => setNotizen(e.target.value)}
          placeholder="Notizen zur Begutachtung..."
          rows={4}
          className="w-full border border-claimondo-border rounded-ios-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-[var(--brand-secondary)] bg-white"
        />
        <div className="flex flex-wrap gap-2 mt-2">
          {NOTIZEN_TAGS.map(tag => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                selectedTags.has(tag)
                  ? 'bg-[var(--brand-secondary)] text-white border-[var(--brand-secondary)]'
                  : 'bg-white text-claimondo-ondo border-claimondo-border hover:border-[var(--brand-secondary)]'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Sticky Footer: Progress + Abschliessen */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-claimondo-border px-4 py-4 safe-area-bottom">
        {/* Progress Bar */}
        <div className="mb-3">
          <div className="flex justify-between text-xs text-claimondo-ondo mb-1">
            <span>{completedRequired}/{totalRequired} Pflichtdokumente</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-2 bg-claimondo-bg rounded-full">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progressPct}%`,
                backgroundColor: progressPct === 100 ? 'var(--brand-success, #10b981)' : 'var(--brand-secondary)',
              }}
            />
          </div>
        </div>

        <button
          onClick={() => setConfirmModal(true)}
          disabled={pending}
          className={`w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-bold transition-colors ${
            progressPct === 100
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-[var(--brand-primary)] hover:bg-claimondo-navy text-white'
          }`}
        >
          <ClipboardListIcon className="w-5 h-5" />
          Begutachtung abschliessen
        </button>
      </div>

      {/* Confirm Modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-md">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-claimondo-navy">Begutachtung abschliessen?</h3>
              <button onClick={() => setConfirmModal(false)}>
                <XIcon className="w-5 h-5 text-claimondo-ondo/70" />
              </button>
            </div>
            {progressPct < 100 && (
              <div className="bg-amber-50 border border-amber-200 rounded-ios-xl p-3 mb-4 flex items-start gap-2">
                <AlertTriangleIcon className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-700">
                  Noch nicht alle Pflichtdokumente aufgenommen ({completedRequired}/{totalRequired}).
                </p>
              </div>
            )}
            <p className="text-sm text-claimondo-ondo mb-4">
              Die Begutachtung wird als abgeschlossen markiert und der Kunde per WhatsApp benachrichtigt.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmModal(false)}
                className="flex-1 py-2.5 rounded-ios-xl text-sm bg-claimondo-bg text-claimondo-ondo font-medium"
              >
                Abbrechen
              </button>
              <button
                onClick={handleComplete}
                disabled={pending}
                className="flex-1 py-2.5 rounded-ios-xl text-sm font-semibold bg-emerald-600 text-white disabled:opacity-50"
              >
                {pending ? 'Speichere...' : 'Abschliessen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
