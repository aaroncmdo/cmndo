'use client'

// CMM-32: Drag & Drop / Multi-File-Upload-Banner für das Gutachten +
// Anhänge. Erscheint auf der SV-Fallseite wenn der Termin durchgeführt ist
// und das Gutachten noch nicht hochgeladen wurde. Erste hochgeladene PDF
// gilt als Hauptgutachten — alle weiteren als Anlagen.

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UploadCloudIcon, FileTextIcon, CheckIcon, SendIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { gutachtenAbgeben } from '@/lib/auftrag/qc'

type Props = {
  auftragId: string
  claimId: string
  hatGutachten: boolean
  /** CMM-32e: KB hat Nachbesserung angefordert. Banner wird lila + zeigt Grund + öffnet Re-Upload. */
  zurueckgewiesenAm?: string | null
  zurueckweisungGrund?: string | null
  /** CMM-32e: Anzahl Hauptgutachten-PDFs die seit dem letzten Submit hochgeladen wurden. */
  abgebbareDokumenteAnzahl?: number
}

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error'
type UploadFile = { name: string; status: UploadStatus; error?: string; istHaupt: boolean }

export default function GutachtenUploadBanner({
  auftragId,
  claimId,
  hatGutachten,
  zurueckgewiesenAm,
  zurueckweisungGrund,
  abgebbareDokumenteAnzahl = 0,
}: Props) {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [pending, startTransition] = useTransition()
  const [submitPending, startSubmit] = useTransition()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const router = useRouter()

  const erfolgreicheUploads = files.filter((f) => f.status === 'done').length
  const abgebbar = abgebbareDokumenteAnzahl + erfolgreicheUploads > 0

  function handleAbgeben() {
    setSubmitError(null)
    startSubmit(async () => {
      const r = await gutachtenAbgeben(auftragId)
      if (!r.ok) setSubmitError(r.error ?? 'Abgabe fehlgeschlagen')
      else {
        setFiles([])
        router.refresh()
      }
    })
  }

  // CMM-32e: Reject-Modus — KB hat Nachbesserung gefordert.
  // SV sieht lila Banner mit Grund + Re-Upload-Zone.
  const istReject = !!zurueckgewiesenAm
  // CMM-32e: Korrektur eingereicht — grund bleibt für Audit, _am ist null.
  // Banner zeigt "Vielen Dank — Prüfung läuft", kein Drag&Drop mehr.
  const istKorrekturEingereicht = !!zurueckweisungGrund && !zurueckgewiesenAm

  if (istKorrekturEingereicht && files.length === 0) {
    return (
      <div className="rounded-2xl bg-violet-50 border border-violet-200 px-4 py-3 flex items-center gap-3">
        <CheckIcon className="w-4 h-4 shrink-0 text-violet-700" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-violet-900">Vielen Dank!</p>
          <p className="text-xs text-violet-800">Wir werden die Dokumente schnellstmöglich überprüfen.</p>
        </div>
      </div>
    )
  }

  if (hatGutachten && !istReject && files.length === 0) {
    return (
      <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-3">
        <CheckIcon className="w-4 h-4 shrink-0 text-emerald-700" />
        <span className="text-sm font-medium text-emerald-800">Gutachten hochgeladen — QC läuft.</span>
      </div>
    )
  }

  async function uploadEine(file: File, istHaupt: boolean): Promise<{ ok: boolean; error?: string }> {
    const supabase = createClient()
    const safeName = file.name.replace(/[^a-z0-9._-]/gi, '_')
    // CMM-32: Storage am Claim verankern, Auftrag-Bezug bleibt im Pfad.
    // CMM-32e: bei aktivem Reject landet jede Datei in einem
    // nachbesserung/-Subfolder — sauber abgegrenzt, mehrfach-iterierbar.
    const subfolder = istReject ? 'nachbesserung/' : ''
    const storagePath = `claim/${claimId}/gutachten/${auftragId}/${subfolder}${Date.now()}-${safeName}`
    // Direktupload — kein API-Body, umgeht Vercel-413-Limit
    const { error: upErr } = await supabase.storage
      .from('fall-dokumente')
      .upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: false })
    if (upErr) return { ok: false, error: upErr.message }

    // Metadaten + Auftrag-Update via Finalize-API
    const res = await fetch('/api/sv/upload-gutachten/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auftragId,
        storagePath,
        filename: file.name,
        sizeBytes: file.size,
        mimeType: file.type,
        istHauptgutachten: istHaupt,
      }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      return { ok: false, error: (j as { error?: string }).error ?? `HTTP ${res.status}` }
    }
    return { ok: true }
  }

  function handleFiles(filesIn: FileList | File[]) {
    const arr = Array.from(filesIn)
    if (!arr.length) return
    // CMM-32e: Bei Re-Upload nach Reject behandeln wir die erste PDF auch als
    // Haupt — sonst würde finalize den alten gutachten_url-Wert behalten.
    const istErsterPDF = (!hatGutachten || istReject) && files.length === 0
    const initial: UploadFile[] = arr.map((f, i) => ({
      name: f.name,
      status: 'uploading' as UploadStatus,
      istHaupt: istErsterPDF && i === 0 && f.type === 'application/pdf',
    }))
    setFiles((s) => [...s, ...initial])

    startTransition(async () => {
      for (let i = 0; i < arr.length; i++) {
        const file = arr[i]
        const istHaupt = istErsterPDF && i === 0 && file.type === 'application/pdf'
        const r = await uploadEine(file, istHaupt)
        setFiles((s) =>
          s.map((f) =>
            f.name === file.name && f.status === 'uploading'
              ? { ...f, status: r.ok ? 'done' : 'error', error: r.error }
              : f,
          ),
        )
      }
      // CMM-32e: Kein router.refresh mehr nach Upload — der explizite
      // Abgeben-Button triggert die finale QC-Submission.
    })
  }

  const colorBg = istReject ? 'bg-violet-50' : 'bg-amber-50'
  const colorBorder = istReject ? 'border-violet-300' : 'border-amber-300'
  const colorText = istReject ? 'text-violet-900' : 'text-amber-900'
  const colorTextSub = istReject ? 'text-violet-800' : 'text-amber-800'
  const colorIcon = istReject ? 'text-violet-700' : 'text-amber-700'
  const colorDropBorder = istReject ? 'border-violet-300' : 'border-amber-300'
  const colorDropHover = istReject ? 'hover:bg-violet-50' : 'hover:bg-amber-50'
  const colorDropDragOver = istReject ? 'bg-violet-100 border-violet-400' : 'bg-amber-100 border-amber-400'

  return (
    <div className={`rounded-2xl ${colorBg} border-2 border-dashed ${colorBorder} px-4 py-5 space-y-3`}>
      <div className="flex items-start gap-3">
        <FileTextIcon className={`w-5 h-5 shrink-0 ${colorIcon} mt-0.5`} />
        <div className="flex-1">
          <p className={`text-sm font-semibold ${colorText}`}>
            {istReject ? 'Nachbesserung erforderlich' : 'Gutachten hochladen'}
          </p>
          {istReject && zurueckweisungGrund ? (
            <p className={`text-xs ${colorTextSub} mt-0.5 whitespace-pre-line`}>
              <strong>Grund:</strong> {zurueckweisungGrund}
            </p>
          ) : null}
          <p className={`text-xs ${colorTextSub} mt-0.5`}>
            {istReject
              ? 'Lade die korrigierte Version hoch. Beim nächsten Upload startet der QC-Prozess automatisch neu.'
              : 'Lade hier dein Gutachten + zugehörige Fotos und Dokumente hoch. Die erste PDF gilt als Hauptgutachten und startet den QC-Prozess.'}
          </p>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          handleFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        className={`rounded-xl border border-dashed cursor-pointer transition-colors px-4 py-6 text-center ${
          dragOver ? colorDropDragOver : `bg-white ${colorDropBorder} ${colorDropHover}`
        }`}
      >
        <UploadCloudIcon className={`w-6 h-6 mx-auto mb-2 ${istReject ? 'text-violet-600' : 'text-amber-600'}`} />
        <p className={`text-sm font-medium ${colorText}`}>
          Dateien hierher ziehen oder klicken zum Auswählen
        </p>
        <p className={`text-xs mt-1 ${colorIcon}`}>PDF, JPG, PNG · Mehrere Dateien möglich</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  f.status === 'done'
                    ? 'bg-emerald-500'
                    : f.status === 'error'
                      ? 'bg-red-500'
                      : 'bg-amber-500 animate-pulse'
                }`}
              />
              <span className="font-medium text-claimondo-navy truncate flex-1">{f.name}</span>
              {f.istHaupt && (
                <span className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold">Hauptgutachten</span>
              )}
              {f.status === 'error' && <span className="text-red-700">{f.error ?? 'Fehler'}</span>}
              {f.status === 'done' && <CheckIcon className="w-3 h-3 text-emerald-600" />}
            </li>
          ))}
        </ul>
      )}

      {pending && <p className={`text-xs ${colorIcon}`}>Wird hochgeladen…</p>}

      {/* CMM-32e: Abgeben-Button — finalisiert die Submission an die KB-QC. */}
      {abgebbar && (
        <div className="border-t border-claimondo-border/60 pt-3 flex items-center justify-between gap-3">
          <p className={`text-xs ${colorTextSub}`}>
            {istReject
              ? 'Korrigierte Version bereit zur Abgabe.'
              : 'Bereit zur Abgabe — der KB beginnt mit dem Vollständigkeits-Check.'}
          </p>
          <button
            onClick={handleAbgeben}
            disabled={submitPending || pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white text-sm font-semibold px-4 py-2 transition-colors"
          >
            <SendIcon className="w-4 h-4" />
            {submitPending ? 'Wird abgegeben…' : 'Abgeben'}
          </button>
        </div>
      )}
      {submitError && <p className="text-xs text-red-700">{submitError}</p>}
    </div>
  )
}
