'use client'

// AAR-294 / AAR-400 / AAR-398: Technische Stellungnahme — Inline-Upload in der Fallakte.
// Ersetzt die frühere dedizierte Route /gutachter/stellungnahme/[fallId].
//
// Self-Gating über Whitelist aktiver States — robust gegen DB-Drift
// (früherer Blacklist-Check hat 'nicht_benoetigt' (Underscore) ≠
// 'nicht-angefordert' (Bindestrich) nicht gefangen → Card rendert falsch).
//
// States:
//   - 'beauftragt' → Inline-Upload (PDF + Notiz)
//   - 'hochgeladen' / 'freigegeben' → grüne Erfolgs-Ansicht mit Datum
//   - 'abgelehnt' → rot (KB hat abgelehnt)

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
  FileSignatureIcon,
  ClockIcon,
  CheckCircle2Icon,
  UploadCloudIcon,
  FileTextIcon,
  Loader2Icon,
} from 'lucide-react'
import { tageSeit } from '@/lib/gutachter/abrechnung'
import { uploadTechnischeStellungnahme } from '@/lib/actions/stellungnahme-upload'

type Fall = {
  id: string
  technische_stellungnahme_status?: string | null
  technische_stellungnahme_beauftragt_am?: string | null
  technische_stellungnahme_hochgeladen_am?: string | null
  technische_stellungnahme_freigabe_am?: string | null
}

const MAX_BYTES = 20 * 1024 * 1024

const AKTIVE_STATES = new Set(['beauftragt', 'hochgeladen', 'freigegeben', 'abgelehnt'])

export function StellungnahmeCard({ fall, id }: { fall: Fall; id?: string }) {
  const router = useRouter()
  const status = fall.technische_stellungnahme_status
  const [isPending, startTransition] = useTransition()
  const [file, setFile] = useState<File | null>(null)
  const [notiz, setNotiz] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  if (!status || !AKTIVE_STATES.has(status)) return null

  const hochgeladen =
    status === 'hochgeladen' ||
    status === 'freigegeben' ||
    Boolean(fall.technische_stellungnahme_hochgeladen_am)
  const tage = tageSeit(fall.technische_stellungnahme_beauftragt_am)

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.type !== 'application/pdf') {
      toast.error('Nur PDF-Dateien erlaubt')
      return
    }
    if (f.size > MAX_BYTES) {
      toast.error('Datei zu groß (max 20 MB)')
      return
    }
    setFile(f)
  }

  function handleSubmit() {
    if (!file) return
    startTransition(async () => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('notiz', notiz)
      const result = await uploadTechnischeStellungnahme(fall.id, fd)
      if (result.success) {
        toast.success('Technische Stellungnahme hochgeladen')
        setFile(null)
        setNotiz('')
        router.refresh()
      } else {
        toast.error(result.error ?? 'Upload fehlgeschlagen')
      }
    })
  }

  return (
    <div
      id={id}
      className={`rounded-2xl border p-4 sm:p-5 space-y-3 ${
        hochgeladen
          ? 'bg-emerald-50 border-emerald-200'
          : 'bg-amber-50 border-amber-200'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSignatureIcon
            className={`w-4 h-4 ${
              hochgeladen ? 'text-emerald-600' : 'text-amber-700'
            }`}
          />
          <p className="text-xs uppercase tracking-wider font-semibold">
            Technische Stellungnahme
          </p>
        </div>
        {tage != null && !hochgeladen && (
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-700">
            <ClockIcon className="w-3 h-3" />
            seit {tage} {tage === 1 ? 'Tag' : 'Tagen'}
          </span>
        )}
      </div>

      {hochgeladen ? (
        <div className="flex items-center gap-2 text-sm text-emerald-800">
          <CheckCircle2Icon className="w-4 h-4" />
          {fall.technische_stellungnahme_freigabe_am
            ? `Freigegeben am ${new Date(fall.technische_stellungnahme_freigabe_am).toLocaleDateString('de-DE')}`
            : `Hochgeladen am ${
                fall.technische_stellungnahme_hochgeladen_am
                  ? new Date(fall.technische_stellungnahme_hochgeladen_am).toLocaleDateString('de-DE')
                  : '—'
              }`}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-800">
            Die Kanzlei hat eine technische Stellungnahme zu deinem Gutachten
            angefordert. Bitte PDF hochladen.
          </p>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isPending}
            className="w-full rounded-xl border-2 border-dashed border-amber-300 bg-white hover:border-amber-500 px-4 py-5 text-center transition-colors disabled:opacity-50"
          >
            {file ? (
              <div className="flex items-center justify-center gap-2">
                <FileTextIcon className="w-4 h-4 text-[#4573A2]" />
                <span className="text-sm font-medium text-[#0D1B3E] truncate max-w-[220px]">
                  {file.name}
                </span>
                <span className="text-[10px] text-gray-500">
                  ({(file.size / 1024 / 1024).toFixed(1)} MB)
                </span>
              </div>
            ) : (
              <>
                <UploadCloudIcon className="w-6 h-6 text-amber-600 mx-auto mb-1" />
                <p className="text-xs text-gray-600">PDF auswählen (max. 20 MB)</p>
              </>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handlePick}
          />

          <textarea
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Anmerkungen (optional) — z. B. Erläuterung zu UPE-Aufschlägen"
            className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
          />

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!file || isPending}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-semibold disabled:opacity-50"
          >
            {isPending && <Loader2Icon className="w-4 h-4 animate-spin" />}
            Stellungnahme einreichen
          </button>
        </div>
      )}
    </div>
  )
}
