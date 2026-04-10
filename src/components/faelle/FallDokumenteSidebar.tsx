'use client'

import { CheckCircle2Icon, CircleDotIcon, AlertCircleIcon, FileTextIcon, ImageIcon, UploadIcon } from 'lucide-react'
import { getPflichtDokumenteFuerFall, DOKUMENT_LABELS, type Phase, type Szenario } from '@/lib/dokumente/pflicht-dokumente'

// KFZ-172: Dokumente-Sidebar fuer die Fall-Akte Right-Sidebar.
// Zeigt kumulierte Pflichtdokumente mit Status (vorhanden/fehlend/OCR)
// und optionale bereits hochgeladene Dokumente.

export type FallDokumentRow = {
  id: string
  dokument_typ: string
  ist_pflicht: boolean
  ab_phase: string | null
  storage_path: string
  original_filename: string | null
  ocr_status: string | null
  hochgeladen_am: string
}

export default function FallDokumenteSidebar({
  aktuellePhase,
  szenario,
  dokumente,
  onUploadClick,
}: {
  aktuellePhase: string | null
  szenario: string | null
  dokumente: FallDokumentRow[]
  onUploadClick?: (dokumentTyp: string) => void
}) {
  const pflicht = getPflichtDokumenteFuerFall(
    aktuellePhase as Phase | null,
    szenario as Szenario | null,
  )

  // Vorhandene Docs nach Typ indexieren
  const vorhandenMap = new Map<string, FallDokumentRow>()
  for (const d of dokumente) {
    if (!vorhandenMap.has(d.dokument_typ)) {
      vorhandenMap.set(d.dokument_typ, d)
    }
  }

  // Optionale Docs (hochgeladen, aber nicht in der Pflicht-Liste)
  const pflichtTypen = new Set(pflicht.map(p => p.typ))
  const optionale = dokumente.filter(d => !pflichtTypen.has(d.dokument_typ))

  const totalPflicht = pflicht.length
  const erledigtPflicht = pflicht.filter(p => vorhandenMap.has(p.typ)).length

  if (!aktuellePhase || !szenario) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-3">
        <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Dokumente</h3>
        <p className="text-xs text-gray-400">Phase/Szenario nicht gesetzt.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          Dokumente
        </h3>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
          erledigtPflicht === totalPflicht && totalPflicht > 0
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-amber-50 text-amber-700'
        }`}>
          {erledigtPflicht}/{totalPflicht} Pflicht
        </span>
      </div>

      {/* Pflichtdokumente */}
      <div className="space-y-1">
        {pflicht.map(p => {
          const vorhanden = vorhandenMap.get(p.typ)
          const isOcr = vorhanden?.ocr_status === 'done'
          const isProcessing = vorhanden?.ocr_status === 'processing'
          return (
            <div
              key={p.typ}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                vorhanden
                  ? 'bg-emerald-50/50 hover:bg-emerald-50'
                  : 'bg-red-50/30 hover:bg-red-50/60 cursor-pointer'
              }`}
              onClick={!vorhanden && onUploadClick ? () => onUploadClick(p.typ) : undefined}
            >
              {vorhanden ? (
                <CheckCircle2Icon className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
              ) : (
                <AlertCircleIcon className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
              )}
              <span className={`flex-1 ${vorhanden ? 'text-gray-700' : 'text-red-700 font-medium'}`}>
                {p.label}*
              </span>
              {isProcessing && <span className="text-[9px] text-amber-600 animate-pulse">OCR...</span>}
              {isOcr && <span className="text-[9px] text-emerald-600">OCR</span>}
              {!vorhanden && (
                <UploadIcon className="w-3 h-3 text-red-400" />
              )}
            </div>
          )
        })}
      </div>

      {/* Optionale hochgeladene Docs */}
      {optionale.length > 0 && (
        <>
          <div className="border-t border-gray-100 my-2" />
          <div className="space-y-1">
            {optionale.map(d => (
              <div key={d.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs bg-gray-50/50">
                {d.mime_type?.startsWith('image/') ? (
                  <ImageIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                ) : (
                  <FileTextIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                )}
                <span className="text-gray-600 flex-1 truncate">
                  {DOKUMENT_LABELS[d.dokument_typ] ?? d.original_filename ?? d.dokument_typ}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Upload-Hint */}
      {onUploadClick && (
        <button
          type="button"
          onClick={() => onUploadClick('')}
          className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-dashed border-gray-300 text-gray-400 hover:text-[#4573A2] hover:border-[#4573A2] text-[10px] transition-colors"
        >
          <UploadIcon className="w-3 h-3" /> Dokument hochladen
        </button>
      )}
    </div>
  )
}
