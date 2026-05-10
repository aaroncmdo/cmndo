'use client'

import { useState, useEffect, useMemo } from 'react'
import { CheckCircle2Icon, CircleDotIcon, AlertCircleIcon, FileTextIcon, ImageIcon, UploadIcon } from 'lucide-react'
import { getPflichtDokumenteFuerFall, DOKUMENT_LABELS, type Phase, type Szenario } from '@/lib/dokumente/pflicht-dokumente'
import { createClient } from '@/lib/supabase/client'
import FallDokumentDropzone from './FallDokumentDropzone'
import { StatusBadge } from '@/components/shared/StatusBadge'
import OcrAutoFillModal, { type OcrData } from './OcrAutoFillModal'

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
  ocr_extracted_data?: Record<string, unknown> | null
  hochgeladen_am: string
  geloescht_am?: string | null
  mime_type?: string | null
}

export default function FallDokumenteSidebar({
  fallId,
  aktuellePhase,
  szenario,
  dokumente,
  onUploadClick,
}: {
  fallId: string
  aktuellePhase: string | null
  szenario: string | null
  dokumente: FallDokumentRow[]
  onUploadClick?: (dokumentTyp: string) => void
}) {
  const [uploadingTyp, setUploadingTyp] = useState<string | null>(null)
  const [ocrModal, setOcrModal] = useState<{ dokumentTyp: string; data: OcrData } | null>(null)
  const [liveDokumente, setLiveDokumente] = useState<FallDokumentRow[]>(dokumente)
  const supabase = useMemo(() => createClient(), [])

  // Sync props -> state wenn sich Server-Daten aendern (z.B. nach router.refresh)
  useEffect(() => { setLiveDokumente(dokumente) }, [dokumente])

  // Realtime: auf INSERT + UPDATE in fall_dokumente subscriben
  useEffect(() => {
    if (!fallId) return
    const channel = supabase
      .channel(`fall-docs-${fallId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'fall_dokumente', filter: `fall_id=eq.${fallId}` },
        (payload) => {
          const row = payload.new as FallDokumentRow
          if (row.geloescht_am) return
          setLiveDokumente(prev => {
            if (prev.some(d => d.id === row.id)) return prev
            return [...prev, row]
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'fall_dokumente', filter: `fall_id=eq.${fallId}` },
        (payload) => {
          const row = payload.new as FallDokumentRow & { geloescht_am?: string | null }
          setLiveDokumente(prev =>
            row.geloescht_am
              ? prev.filter(d => d.id !== row.id)
              : prev.map(d => d.id === row.id ? { ...d, ...row } : d)
          )
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fallId, supabase])

  const pflicht = getPflichtDokumenteFuerFall(
    aktuellePhase as Phase | null,
    szenario as Szenario | null,
  )

  // Vorhandene Docs nach Typ indexieren (aus live-State)
  const vorhandenMap = new Map<string, FallDokumentRow>()
  for (const d of liveDokumente) {
    if (!vorhandenMap.has(d.dokument_typ)) {
      vorhandenMap.set(d.dokument_typ, d)
    }
  }

  // Optionale Docs (hochgeladen, aber nicht in der Pflicht-Liste)
  const pflichtTypen = new Set(pflicht.map(p => p.typ))
  const optionale = liveDokumente.filter(d => !pflichtTypen.has(d.dokument_typ))

  const totalPflicht = pflicht.length
  const erledigtPflicht = pflicht.filter(p => vorhandenMap.has(p.typ)).length

  if (!aktuellePhase || !szenario) {
    return (
      <div className="bg-white rounded-xl border border-claimondo-border p-3">
        <h3 className="text-[10px] font-semibold text-claimondo-ondo/70 uppercase tracking-wider mb-2">Dokumente</h3>
        <p className="text-xs text-claimondo-ondo/70">Phase/Szenario nicht gesetzt.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-claimondo-border p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-semibold text-claimondo-ondo/70 uppercase tracking-wider">
          Dokumente
        </h3>
        <StatusBadge tone={erledigtPflicht === totalPflicht && totalPflicht > 0 ? 'success' : 'warning'}>
          {erledigtPflicht}/{totalPflicht} Pflicht
        </StatusBadge>
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
              onClick={!vorhanden ? () => setUploadingTyp(p.typ) : undefined}
            >
              {vorhanden ? (
                <CheckCircle2Icon className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
              ) : (
                <AlertCircleIcon className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
              )}
              <span className={`flex-1 ${vorhanden ? 'text-claimondo-navy' : 'text-red-700 font-medium'}`}>
                {p.label}*
              </span>
              {isProcessing && <span className="text-[9px] text-amber-600 animate-pulse">OCR...</span>}
              {isOcr && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation()
                    const parsed = (vorhanden?.ocr_extracted_data as Record<string, unknown>)?.parsed as OcrData | undefined
                    if (parsed) setOcrModal({ dokumentTyp: vorhanden!.dokument_typ, data: parsed })
                  }}
                  className="text-[9px] text-emerald-600 hover:text-emerald-800 underline"
                >
                  OCR
                </button>
              )}
              {!vorhanden && (
                <UploadIcon className="w-3 h-3 text-red-400" />
              )}
            </div>
          )
        })}
      </div>

      {/* Inline-Dropzone fuer den aktuell ausgewaehlten Dokument-Typ */}
      {uploadingTyp && (
        <div className="mt-2">
          <FallDokumentDropzone
            fallId={fallId}
            dokumentTyp={uploadingTyp}
            istPflicht={pflichtTypen.has(uploadingTyp)}
            abPhase={pflicht.find(p => p.typ === uploadingTyp)?.ab_phase ?? aktuellePhase}
            onClose={() => setUploadingTyp(null)}
            onSuccess={() => setUploadingTyp(null)}
          />
        </div>
      )}

      {/* Optionale hochgeladene Docs */}
      {optionale.length > 0 && (
        <>
          <div className="border-t border-claimondo-border my-2" />
          <div className="space-y-1">
            {optionale.map(d => (
              <div key={d.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs bg-claimondo-bg/50">
                {d.mime_type?.startsWith('image/') ? (
                  <ImageIcon className="w-3.5 h-3.5 text-claimondo-ondo/70 flex-shrink-0" />
                ) : (
                  <FileTextIcon className="w-3.5 h-3.5 text-claimondo-ondo/70 flex-shrink-0" />
                )}
                <span className="text-claimondo-ondo flex-1 truncate">
                  {DOKUMENT_LABELS[d.dokument_typ] ?? d.original_filename ?? d.dokument_typ}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Upload-Hint */}
      <button
        type="button"
        onClick={() => setUploadingTyp('sonstiges')}
        className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-dashed border-claimondo-border text-claimondo-ondo/70 hover:text-claimondo-ondo hover:border-claimondo-ondo text-[10px] transition-colors"
      >
        <UploadIcon className="w-3 h-3" /> Weiteres Dokument
      </button>

      {/* KFZ-172: OCR Auto-Fill Modal */}
      {ocrModal && (
        <OcrAutoFillModal
          fallId={fallId}
          dokumentTyp={ocrModal.dokumentTyp}
          ocrData={ocrModal.data}
          onClose={() => setOcrModal(null)}
        />
      )}
    </div>
  )
}
