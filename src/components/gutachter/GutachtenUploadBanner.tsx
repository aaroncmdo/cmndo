'use client'

// CMM-32: Drag & Drop / Multi-File-Upload-Banner für das Gutachten +
// Anhänge. Erscheint auf der SV-Fallseite wenn der Termin durchgeführt ist
// und das Gutachten noch nicht hochgeladen wurde. Erste hochgeladene PDF
// gilt als Hauptgutachten — alle weiteren als Anlagen.

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UploadCloudIcon, FileTextIcon, CheckIcon, SendIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/primitives'
import { createClient } from '@/lib/supabase/client'
import { gutachtenAbgeben, loescheGutachtenDokument } from '@/lib/auftrag/qc'

type Props = {
  auftragId: string
  // `claimId` entfaellt: den Storage-Pfad baut jetzt die signed-url-Route serverseitig
  // (aus auftraege.claim_id) — der Client soll ihn gar nicht mehr bestimmen koennen.
  hatGutachten: boolean
  /** CMM-32e: KB hat Nachbesserung angefordert. Banner wird lila + zeigt Grund + öffnet Re-Upload. */
  zurueckgewiesenAm?: string | null
  zurueckweisungGrund?: string | null
  /** CMM-32e: Anzahl Hauptgutachten-PDFs die seit dem letzten Submit hochgeladen wurden. */
  abgebbareDokumenteAnzahl?: number
  /** CMM-32e: Granulare Dok-Beanstandungen — welche Dateien konkret abgelehnt wurden + warum. */
  abgelehnteDocsInfo?: { filename: string; kommentar: string | null }[]
}

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error' | 'deleting'
type UploadFile = { name: string; status: UploadStatus; error?: string; istHaupt: boolean; storagePath?: string }

export default function GutachtenUploadBanner({
  auftragId,
  hatGutachten,
  zurueckgewiesenAm,
  zurueckweisungGrund,
  abgebbareDokumenteAnzahl = 0,
  abgelehnteDocsInfo = [],
}: Props) {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()
  const [submitPending, startSubmit] = useTransition()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const router = useRouter()

  const erfolgreicheUploads = files.filter((f) => f.status === 'done').length
  const abgebbar = abgebbareDokumenteAnzahl + erfolgreicheUploads > 0

  function handleLoeschen(idx: number) {
    const f = files[idx]
    if (!f.storagePath || f.status === 'deleting') return
    setFiles((s) => s.map((x, i) => i === idx ? { ...x, status: 'deleting' } : x))
    loescheGutachtenDokument(auftragId, f.storagePath).then((r) => {
      if (r.ok) {
        setFiles((s) => s.filter((_, i) => i !== idx))
      } else {
        setFiles((s) => s.map((x, i) => i === idx ? { ...x, status: 'error', error: r.error } : x))
      }
    })
  }

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
      <div className="rounded-2xl bg-claimondo-ondo/[0.06] border border-claimondo-ondo/30 px-4 py-3 flex items-center gap-3">
        <CheckIcon className="w-4 h-4 shrink-0 text-claimondo-navy" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-claimondo-navy">Vielen Dank!</p>
          <p className="text-xs text-claimondo-navy">Wir werden die Dokumente schnellstmöglich überprüfen.</p>
        </div>
      </div>
    )
  }

  if (hatGutachten && !istReject && files.length === 0) {
    return (
      <div className="rounded-2xl bg-success-soft border border-success/30 px-4 py-3 flex items-center gap-3">
        <CheckIcon className="w-4 h-4 shrink-0 text-success-strong" />
        <span className="text-sm font-medium text-success-strong">Gutachten hochgeladen — QC läuft.</span>
      </div>
    )
  }

  async function uploadEine(file: File, istHaupt: boolean): Promise<{ ok: boolean; storagePath?: string; error?: string }> {
    const supabase = createClient()
    // Direktupload bleibt (Drag&Drop am Claim, kein API-Body -> kein Body-Limit bei
    // grossen Gutachten-PDFs). Er laeuft aber ueber eine SIGNIERTE Upload-URL statt mit
    // dem User-Client: der Bucket `fall-dokumente` ist per RLS gesperrt
    // (locked_buckets_block_authenticated), nur service_role darf schreiben. Vorher
    // scheiterte deshalb JEDER SV-Upload mit „new row violates row-level security policy"
    // — belegt: 962 Objekte im Bucket, davon 0 im SV-Pfad.
    // Marker: broadcast-sv-gutachten-upload-scheitert-an-storage-rls.
    //
    // Den Pfad bestimmt der Server (inkl. CMM-32e nachbesserung/-Subfolder aus
    // auftraege.zurueckgewiesen_am) — der Client kann ihn nicht waehlen.
    const sig = await fetch('/api/sv/upload-gutachten/signed-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auftragId, filename: file.name }),
    })
    if (!sig.ok) {
      const j = await sig.json().catch(() => ({}))
      return { ok: false, error: (j as { error?: string }).error ?? `HTTP ${sig.status}` }
    }
    const { path: storagePath, token } = (await sig.json()) as { path: string; token: string }

    const { error: upErr } = await supabase.storage
      .from('fall-dokumente')
      .uploadToSignedUrl(storagePath, token, file, {
        contentType: file.type || 'application/octet-stream',
      })
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
    return { ok: true, storagePath }
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
              ? { ...f, status: r.ok ? 'done' : 'error', error: r.error, storagePath: r.storagePath }
              : f,
          ),
        )
      }
      // CMM-32e: Kein router.refresh mehr nach Upload — der explizite
      // Abgeben-Button triggert die finale QC-Submission.
    })
  }

  const colorBg = istReject ? 'bg-claimondo-ondo/[0.06]' : 'bg-warning-soft'
  const colorBorder = istReject ? 'border-claimondo-ondo/50' : 'border-warning/30'
  const colorText = istReject ? 'text-claimondo-navy' : 'text-warning-strong'
  const colorTextSub = istReject ? 'text-claimondo-navy' : 'text-warning-strong'
  const colorIcon = istReject ? 'text-claimondo-navy' : 'text-warning-strong'
  const colorDropBorder = istReject ? 'border-claimondo-ondo/50' : 'border-warning/30'
  const colorDropHover = istReject ? 'hover:bg-claimondo-ondo/[0.06]' : 'hover:bg-warning-soft'
  const colorDropDragOver = istReject ? 'bg-claimondo-ondo/[0.10] border-claimondo-ondo/60' : 'bg-warning/15 border-warning/40'

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
              : 'Laden Sie hier Ihr Gutachten + zugehörige Fotos und Dokumente hoch. Die erste PDF gilt als Hauptgutachten und startet den QC-Prozess.'}
          </p>
          {/* CMM-32e: Konkret beanstandete Dokumente mit optionalem KB-Kommentar */}
          {istReject && abgelehnteDocsInfo.length > 0 && (
            <div className="mt-2 space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-claimondo-navy">Beanstandete Dateien</p>
              {abgelehnteDocsInfo.map((d, i) => (
                <div key={i} className="rounded-ios-md bg-white/70 border border-claimondo-ondo/30 px-2.5 py-1.5">
                  <p className="text-xs font-medium text-claimondo-navy truncate">{d.filename}</p>
                  {d.kommentar && (
                    <p className="text-[11px] text-claimondo-navy mt-0.5">{d.kommentar}</p>
                  )}
                </div>
              ))}
            </div>
          )}
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
        className={`rounded-ios-xl border border-dashed cursor-pointer transition-colors px-4 py-6 text-center ${
          dragOver ? colorDropDragOver : `bg-white ${colorDropBorder} ${colorDropHover}`
        }`}
      >
        <UploadCloudIcon className={`w-6 h-6 mx-auto mb-2 ${istReject ? 'text-claimondo-navy' : 'text-warning'}`} />
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
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-2 text-xs"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
            >
              {/* Grüner Punkt → Mülleimer on hover (nur wenn done + storagePath bekannt) */}
              {f.status === 'done' && f.storagePath ? (
                <button
                  type="button"
                  onClick={() => handleLoeschen(i)}
                  className="w-4 h-4 shrink-0 flex items-center justify-center"
                  title="Datei löschen"
                >
                  {hoverIdx === i ? (
                    <Trash2Icon className="w-3.5 h-3.5 text-danger hover:text-danger-strong transition-colors" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-success block" />
                  )}
                </button>
              ) : (
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    f.status === 'error'
                      ? 'bg-danger'
                      : f.status === 'deleting'
                        ? 'bg-claimondo-light-blue animate-pulse'
                        : 'bg-warning animate-pulse'
                  }`}
                />
              )}
              <span className={`font-medium truncate flex-1 ${f.status === 'deleting' ? 'text-claimondo-ondo/50 line-through' : 'text-claimondo-navy'}`}>
                {f.name}
              </span>
              {f.status === 'error' && <span className="text-danger-strong">{f.error ?? 'Fehler'}</span>}
              {f.status === 'done' && !f.storagePath && <CheckIcon className="w-3 h-3 text-success" />}
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
          <Button
            variant="navy"
            size="sm"
            loading={submitPending}
            disabled={pending}
            onClick={handleAbgeben}
            iconLeft={<SendIcon className="w-4 h-4" />}
          >
            {submitPending ? 'Wird abgegeben…' : 'Abgeben'}
          </Button>
        </div>
      )}
      {submitError && <p className="text-xs text-danger-strong">{submitError}</p>}
    </div>
  )
}
