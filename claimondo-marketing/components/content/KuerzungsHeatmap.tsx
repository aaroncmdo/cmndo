import Link from 'next/link'

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

export type KuerzungScore = 0 | 1 | 2 | 3

export interface KuerzungEntry {
  taktik: string
  /** 0 = selten/kulant, 1 = gelegentlich, 2 = Standard, 3 = aggressiv/dokumentiert (R2-Skala). */
  score: KuerzungScore
  belegUrl?: string
  decoderUrl?: string
}

interface Props {
  /** Slug — aktuell nur fuer Stabilitaet/künftige Analytik, nicht gerendert. */
  versichererSlug: string
  kuerzungen: KuerzungEntry[]
}

const SCORE: Record<KuerzungScore, { label: string; dot: string; chip: string; text: string }> = {
  0: { label: 'selten / kulant', dot: 'bg-emerald-500', chip: 'border-emerald-200 bg-emerald-50', text: 'text-emerald-700' },
  1: { label: 'gelegentlich', dot: 'bg-amber-400', chip: 'border-amber-200 bg-amber-50', text: 'text-amber-700' },
  2: { label: 'Standard', dot: 'bg-orange-500', chip: 'border-orange-200 bg-orange-50', text: 'text-orange-700' },
  3: { label: 'aggressiv / dokumentiert', dot: 'bg-red-600', chip: 'border-red-200 bg-red-50', text: 'text-red-700' },
}

/**
 * Kürzungs-Heatmap (CONTRACT F-22): typische Kürzungspositionen eines Versicherers,
 * farbcodiert nach Häufigkeit, je Position verlinkt auf den passenden Decoder.
 */
export function KuerzungsHeatmap({ kuerzungen }: Props) {
  return (
    <section>
      <h2 style={HEAD_FONT} className="text-2xl font-extrabold text-claimondo-navy">
        Kürzungspraxis im Überblick
      </h2>
      <p className="mt-2 max-w-[65ch] text-[0.9375rem] leading-relaxed text-claimondo-shield">
        Häufigkeit typischer Kürzungspositionen in der Drittschaden-Regulierung — eingestuft
        anhand dokumentierter Gerichtsurteile, Anwalts-Kasuistik und Prüfdienst-Praxis.
      </p>
      <ul className="mt-5 divide-y divide-claimondo-border overflow-hidden rounded-ios-md border border-claimondo-border bg-white">
        {kuerzungen.map((k) => {
          const s = SCORE[k.score]
          const inner = (
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="flex items-center gap-2.5 text-[0.9375rem] font-medium text-claimondo-navy">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} aria-hidden />
                {k.taktik}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className={`hidden rounded-full border px-2.5 py-0.5 text-xs font-semibold sm:inline ${s.chip} ${s.text}`}>
                  {s.label}
                </span>
                {k.decoderUrl && (
                  <span className="text-xs font-semibold text-claimondo-ondo">Decoder →</span>
                )}
              </span>
            </div>
          )
          return (
            <li key={k.taktik}>
              {k.decoderUrl ? (
                <Link href={k.decoderUrl} className="block transition hover:bg-claimondo-bg">
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-xs leading-relaxed text-claimondo-shield/60">
        Einordnung: dokumentierte Einzelfälle, nicht repräsentativ für alle Schadenfälle. Die
        Belege je Position stehen in den verlinkten Decodern.
      </p>
    </section>
  )
}
