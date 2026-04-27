'use client'

// CMM-23: Schlanke Dokumente-Card im SV-Auftrag — alle hochgeladenen Files
// (kunde + sv) auflisten + Upload-Button für SV. Ersetzt FallDokumenteSidebar
// die phasen-/szenario-abhängig war und in vielen Fällen nur "Phase/Szenario
// nicht gesetzt" gezeigt hat.
//
// Aaron-Spec: muss einen Upload haben und in den Claim landen — geht via
// uploadDatei (gutachter actions) → fall_dokumente mit dokument_typ='sonstiges'
// und uploaded_by_sv=true.

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileTextIcon,
  ImageIcon,
  UploadIcon,
  Loader2Icon,
  ExternalLinkIcon,
} from 'lucide-react'
import { uploadDatei } from '@/app/gutachter/fall/[id]/actions'

export type WeiteresDokument = {
  id: string
  dokument_typ: string | null
  datei_url: string | null
  datei_name: string | null
  hochgeladen_von_rolle: string | null
  created_at: string | null
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: '2-digit',
    })
  } catch { return iso }
}

function rolleLabel(rolle: string | null): string {
  if (rolle === 'sachverstaendiger') return 'SV'
  if (rolle === 'kunde') return 'Kunde'
  if (rolle === 'kundenbetreuer') return 'KB'
  if (rolle === 'admin') return 'Admin'
  return ''
}

export default function WeitereDokumenteCard({
  fallId,
  dokumente,
}: {
  fallId: string
  dokumente: WeiteresDokument[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Gutachten separat in der GutachtenCard — hier alles andere.
  const sonstige = dokumente.filter((d) => d.dokument_typ !== 'gutachten')

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('kategorie', 'sonstiges')
      try {
        await uploadDatei(fallId, fd)
        if (inputRef.current) inputRef.current.value = ''
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
      }
    })
  }

  return (
    <div className="rounded-2xl bg-white border border-claimondo-border p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-claimondo-navy">
          Hochgeladene Dokumente
        </p>
        <span className="text-xs text-claimondo-ondo">{sonstige.length}</span>
      </div>

      {sonstige.length === 0 ? (
        <p className="text-xs text-claimondo-ondo/70 text-center py-3">
          Noch keine Dokumente am Fall.
        </p>
      ) : (
        <ul className="space-y-2 mb-3">
          {sonstige.map((d) => {
            const isImage = (d.datei_name ?? '').match(/\.(jpe?g|png|heic|webp)$/i)
            const Icon = isImage ? ImageIcon : FileTextIcon
            return (
              <li
                key={d.id}
                className="flex items-center gap-3 rounded-xl border border-claimondo-border bg-[#f8f9fb] p-2.5"
              >
                <div className="w-8 h-8 rounded-lg bg-white border border-claimondo-border text-claimondo-ondo flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-claimondo-navy truncate">
                    {d.datei_name ?? d.dokument_typ ?? 'Unbenannt'}
                  </p>
                  <p className="text-[11px] text-claimondo-ondo">
                    {rolleLabel(d.hochgeladen_von_rolle)}
                    {d.hochgeladen_von_rolle && ' · '}
                    {fmtDate(d.created_at)}
                  </p>
                </div>
                {d.datei_url && (
                  <a
                    href={d.datei_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-claimondo-ondo hover:text-claimondo-navy"
                    aria-label="Datei öffnen"
                  >
                    <ExternalLinkIcon className="w-4 h-4" />
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <label
        className={`flex items-center justify-center gap-2 w-full min-h-11 rounded-xl border-2 border-dashed border-claimondo-border hover:border-claimondo-ondo bg-[#f8f9fb] hover:bg-white text-sm font-medium text-claimondo-navy cursor-pointer transition-colors ${
          pending ? 'opacity-60 pointer-events-none' : ''
        }`}
      >
        {pending ? (
          <>
            <Loader2Icon className="w-4 h-4 animate-spin" /> Lädt hoch …
          </>
        ) : (
          <>
            <UploadIcon className="w-4 h-4" /> Weiteres Dokument hochladen
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          disabled={pending}
          onChange={handleFileSelected}
        />
      </label>
      {error && (
        <p className="mt-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
          {error}
        </p>
      )}
    </div>
  )
}
