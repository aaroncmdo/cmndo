'use client'

// AAR-559 (C10): Upload-Formular für technische Stellungnahme.
// Zeigt VS-Kürzungspositionen als Kontext, dann PDF-Upload + optionale Notiz.

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeftIcon,
  FileTextIcon,
  UploadCloudIcon,
  Loader2Icon,
  AlertTriangleIcon,
  CheckCircle2Icon,
} from 'lucide-react'
import { submitStellungnahme } from './actions'
import { formatDatum, formatEURausEuro } from '@/lib/format'
import PageHeader from '@/components/shared/PageHeader'

type KuerzungsPosition = {
  id: string
  typ: string | null
  bezeichnung: string | null
  betrag_gefordert: number | null
  betrag_reguliert: number | null
  betrag_gekuerzt: number | null
}

interface Props {
  fallId: string
  fallNummer: string | null
  beauftragAm: string | null
  vsKuerzungGrund: string | null
  kuerzungsBetrag: number | null
  kuerzungen: KuerzungsPosition[]
}

const MAX_BYTES = 20 * 1024 * 1024


export default function StellungnahmeClient({
  fallId,
  fallNummer,
  beauftragAm,
  vsKuerzungGrund,
  kuerzungsBetrag,
  kuerzungen,
}: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [notiz, setNotiz] = useState('')
  const [bestaetigt, setBestaetigt] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError(null)
    const f = e.target.files?.[0]
    if (!f) return
    const allowed = ['application/pdf', 'image/jpeg', 'image/png']
    if (!allowed.includes(f.type)) {
      setFileError('Nur PDF, JPEG oder PNG erlaubt')
      return
    }
    if (f.size > MAX_BYTES) {
      setFileError('Datei zu groß (max. 20 MB)')
      return
    }
    setFile(f)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !bestaetigt || isPending) return
    setSubmitError(null)
    startTransition(async () => {
      const result = await submitStellungnahme({
        fallId,
        file,
        notizSv: notiz.trim() || undefined,
      })
      if (result.success) {
        router.push(`/gutachter/fall/${fallId}`)
      } else {
        setSubmitError(result.error ?? 'Einreichung fehlgeschlagen')
      }
    })
  }

  const hasKuerzungen = kuerzungen.length > 0
  const totalGekuerzt = kuerzungen.reduce((sum, k) => sum + (k.betrag_gekuerzt ?? 0), 0)

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <PageHeader
        title="Technische Stellungnahme"
        description={fallNummer ? `Fall ${fallNummer}` : undefined}
        leadingSlot={
          <button
            type="button"
            onClick={() => router.back()}
            className="p-2 rounded-lg text-claimondo-ondo hover:bg-[#f8f9fb] transition-colors shrink-0"
            aria-label="Zurück"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
        }
      />

      {/* Kontext: Kürzungs-Positionen */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
        <div className="flex items-start gap-2">
          <AlertTriangleIcon className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-900">
              Die Kanzlei hat eine Stellungnahme zu den VS-Kürzungen angefordert
              {beauftragAm ? ` (${formatDatum(beauftragAm)})` : ''}.
            </p>
            <p className="text-xs text-amber-800 mt-0.5">
              Bitte lade deine technische Stellungnahme als PDF hoch und erläutere
              kurz deine Einschätzung zu den strittigen Positionen.
            </p>
          </div>
        </div>

        {hasKuerzungen ? (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
              Kürzungs-Positionen der VS
            </p>
            {kuerzungen.map((k) => (
              <div
                key={k.id}
                className="flex items-start justify-between gap-2 bg-white rounded-lg px-3 py-2 border border-amber-100 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-claimondo-navy truncate">
                    {k.bezeichnung ?? k.typ ?? '—'}
                  </p>
                  {k.typ && k.bezeichnung && (
                    <p className="text-[11px] text-claimondo-ondo">{k.typ}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-claimondo-ondo line-through">
                    {formatEURausEuro(k.betrag_gefordert)}
                  </p>
                  <p className="text-sm font-semibold text-red-600">
                    − {formatEURausEuro(k.betrag_gekuerzt)}
                  </p>
                </div>
              </div>
            ))}
            {totalGekuerzt > 0 && (
              <div className="flex justify-between items-center px-3 py-1.5 bg-amber-100 rounded-lg">
                <p className="text-xs font-semibold text-amber-900">Gesamt gekürzt</p>
                <p className="text-sm font-bold text-red-700">− {formatEURausEuro(totalGekuerzt)}</p>
              </div>
            )}
          </div>
        ) : vsKuerzungGrund ? (
          <div className="bg-white rounded-lg px-3 py-2 border border-amber-100 text-sm text-claimondo-navy">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 mb-1">
              Kürzungs-Grund
            </p>
            <p>{vsKuerzungGrund}</p>
            {kuerzungsBetrag != null && (
              <p className="mt-1 font-semibold text-red-600">
                Gekürzt: {formatEURausEuro(kuerzungsBetrag)}
              </p>
            )}
          </div>
        ) : null}
      </div>

      {/* Upload-Formular */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Datei-Auswahl */}
        <div className="space-y-1">
          <label className="text-sm font-semibold text-claimondo-navy">
            Stellungnahme hochladen <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isPending}
            className="w-full rounded-2xl border-2 border-dashed border-claimondo-border bg-white hover:border-[#4573A2] px-4 py-6 text-center transition-colors disabled:opacity-50"
          >
            {file ? (
              <div className="flex items-center justify-center gap-2">
                <FileTextIcon className="w-5 h-5 text-[#4573A2]" />
                <span className="text-sm font-medium text-[#0D1B3E] truncate max-w-[220px]">
                  {file.name}
                </span>
                <span className="text-[11px] text-claimondo-ondo">
                  ({(file.size / 1024 / 1024).toFixed(1)} MB)
                </span>
              </div>
            ) : (
              <>
                <UploadCloudIcon className="w-7 h-7 text-claimondo-ondo/70 mx-auto mb-2" />
                <p className="text-sm text-claimondo-ondo">PDF, JPEG oder PNG — max. 20 MB</p>
                <p className="text-xs text-[#4573A2] mt-1 font-medium">Datei auswählen</p>
              </>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="hidden"
            onChange={handlePick}
          />
          {fileError && (
            <p className="text-xs text-red-600">{fileError}</p>
          )}
        </div>

        {/* Optionale Notiz */}
        <div className="space-y-1">
          <label className="text-sm font-semibold text-claimondo-navy">
            Anmerkungen <span className="text-claimondo-ondo/70 font-normal">(optional)</span>
          </label>
          <textarea
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="z. B. Erläuterung zu UPE-Aufschlägen oder Reparaturkosten"
            disabled={isPending}
            className="w-full rounded-xl border border-claimondo-border bg-white px-3 py-2.5 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-[#4573A2] focus:border-transparent resize-none disabled:bg-[#f8f9fb]"
          />
          <p className="text-[10px] text-claimondo-ondo/70 text-right">{notiz.length}/500</p>
        </div>

        {/* Bestätigungs-Checkbox */}
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={bestaetigt}
            onChange={(e) => setBestaetigt(e.target.checked)}
            disabled={isPending}
            className="mt-0.5 w-4 h-4 accent-[#0D1B3E]"
          />
          <span className="text-sm text-claimondo-navy">
            Ich bestätige, dass meine technische Stellungnahme vollständig und korrekt ist
            und der Kanzlei zur Weiterverarbeitung übergeben werden darf.
          </span>
        </label>

        {/* Fehler-Anzeige */}
        {submitError && (
          <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            <AlertTriangleIcon className="w-4 h-4 mt-0.5 shrink-0" />
            {submitError}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!file || !bestaetigt || isPending}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-[#0D1B3E] hover:bg-[#12265a] text-white text-sm font-semibold disabled:opacity-40 transition-colors"
        >
          {isPending ? (
            <>
              <Loader2Icon className="w-4 h-4 animate-spin" />
              Wird eingereicht…
            </>
          ) : (
            <>
              <CheckCircle2Icon className="w-4 h-4" />
              Stellungnahme einreichen
            </>
          )}
        </button>
      </form>
    </div>
  )
}
