'use client'

// CMM-23 / CMM-32: Vollständige Dokumenten-Liste am SV-Auftrag.
// Kategorisiert: Hauptgutachten, Nachbesserung, Anlagen, Pflichtdokumente,
// Weitere. Plus „Weiteres Dokument hochladen"-Button.

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
  storage_path?: string | null
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

type Kategorie = 'gutachten' | 'nachbesserung' | 'anlagen' | 'pflichtdokumente' | 'sonstiges'

const KATEGORIE_LABEL: Record<Kategorie, string> = {
  gutachten: 'Gutachten',
  nachbesserung: 'Nachbesserung',
  anlagen: 'Anlagen',
  pflichtdokumente: 'Pflichtdokumente',
  sonstiges: 'Weitere',
}

const PFLICHT_TYPEN = new Set([
  'fahrzeugschein',
  'fahrzeugschein_rueck',
  'kfz_schein',
  'polizeibericht',
  'kostenvoranschlag',
  'rechnung',
  'mietwagen_rechnung',
  'reparaturrechnung',
])

function kategorisieren(d: WeiteresDokument): Kategorie {
  const typ = (d.dokument_typ ?? '').toLowerCase()
  const pfad = (d.storage_path ?? '').toLowerCase()
  if (typ === 'gutachten') {
    return pfad.includes('/nachbesserung/') ? 'nachbesserung' : 'gutachten'
  }
  if (typ === 'gutachten_anlage') {
    return pfad.includes('/nachbesserung/') ? 'nachbesserung' : 'anlagen'
  }
  if (PFLICHT_TYPEN.has(typ)) return 'pflichtdokumente'
  if (typ === 'sonstiges' || typ === '' || typ === null) return 'sonstiges'
  // Unbekannte slot-IDs → Pflicht-Bucket
  return 'pflichtdokumente'
}

export default function WeitereDokumenteCard({
  fallId,
  dokumente,
  inline = false,
}: {
  fallId: string
  dokumente: WeiteresDokument[]
  /** Wenn true: kein Card-Wrapper + kein Header — für Einbettung in Tab. */
  inline?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const gruppen: Record<Kategorie, WeiteresDokument[]> = {
    gutachten: [],
    nachbesserung: [],
    anlagen: [],
    pflichtdokumente: [],
    sonstiges: [],
  }
  for (const d of dokumente) {
    gruppen[kategorisieren(d)].push(d)
  }
  const reihenfolge: Kategorie[] = ['gutachten', 'nachbesserung', 'anlagen', 'pflichtdokumente', 'sonstiges']
  const total = dokumente.length

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('kategorie', 'sonstiges')
      try {
        const res = await uploadDatei(fallId, fd)
        if (res?.error) {
          setError(res.error)
        } else {
          if (inputRef.current) inputRef.current.value = ''
          router.refresh()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
      }
    })
  }

  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    inline ? (
      <div>{children}</div>
    ) : (
      <div className="rounded-2xl bg-white border border-claimondo-border p-4">
        {children}
      </div>
    )

  return (
    <Wrapper>
      {!inline && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-claimondo-navy">
            Dokumente am Fall
          </p>
          <span className="text-xs text-claimondo-ondo">{total}</span>
        </div>
      )}

      {total === 0 ? (
        <p className="text-xs text-claimondo-ondo/70 text-center py-3">
          Noch keine Dokumente am Fall.
        </p>
      ) : (
        <div className="space-y-3 mb-3">
          {reihenfolge.map((kat) => {
            const items = gruppen[kat]
            if (items.length === 0) return null
            return (
              <div key={kat}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo mb-1.5">
                  {KATEGORIE_LABEL[kat]} <span className="text-claimondo-ondo/60">· {items.length}</span>
                </p>
                <ul className="space-y-1.5">
                  {items.map((d) => {
                    const isImage = (d.datei_name ?? '').match(/\.(jpe?g|png|heic|webp)$/i)
                    const Icon = isImage ? ImageIcon : FileTextIcon
                    return (
                      <li
                        key={d.id}
                        className="flex items-center gap-3 rounded-xl border border-claimondo-border bg-claimondo-bg p-2.5"
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
              </div>
            )
          })}
        </div>
      )}

      <label
        className={`flex items-center justify-center gap-2 w-full min-h-11 rounded-xl border-2 border-dashed border-claimondo-border hover:border-claimondo-ondo bg-claimondo-bg hover:bg-white text-sm font-medium text-claimondo-navy cursor-pointer transition-colors ${
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
        <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
          {error}
        </p>
      )}
    </Wrapper>
  )
}
