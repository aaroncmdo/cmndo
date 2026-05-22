import { ShieldCheck } from 'lucide-react'

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const
const BRAND_CHIP = 'Bundesweites SV-Netzwerk · Sitz Köln'

interface Props {
  title: string
  snippet?: string
  /** z.B. "H4 · Fristen" oder "Versicherer-Brief-Decoder" */
  clusterLabel?: string
  /** §/BGH-Treffer aus extractTrustChips */
  trustChips?: string[]
  lastModified: Date
  readingMin: number
}

export function AssetHero({ title, snippet, clusterLabel, trustChips = [], lastModified, readingMin }: Props) {
  const chips = [...trustChips, BRAND_CHIP]
  const dateValid = !Number.isNaN(lastModified.getTime())
  return (
    <header className="border-b border-claimondo-border pb-7">
      {clusterLabel && (
        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-claimondo-ondo">
          <span className="h-1.5 w-1.5 rounded-full bg-claimondo-light-blue" />
          {clusterLabel}
        </div>
      )}
      <h1 style={HEAD_FONT} className="max-w-3xl text-balance text-4xl font-extrabold leading-[1.08] tracking-tight text-claimondo-navy md:text-5xl">
        {title}
      </h1>
      {snippet && (
        <p className="mt-5 max-w-[60ch] rounded-ios-md border border-claimondo-ondo/25 bg-claimondo-bg px-5 py-4 text-[1.0625rem] leading-relaxed text-claimondo-shield">
          <strong className="font-bold text-claimondo-navy">Kurz erklärt:</strong> {snippet}
        </p>
      )}
      {chips.length > 0 && (
        <ul className="mt-5 flex flex-wrap gap-2">
          {chips.map((c) => (
            <li key={c} className="inline-flex items-center gap-1.5 rounded-full border border-claimondo-border bg-white px-3 py-1.5 text-[0.8125rem] font-semibold text-claimondo-shield shadow-claimondo-sm">
              <ShieldCheck className="h-3.5 w-3.5 text-claimondo-ondo" aria-hidden />
              {c}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.8125rem] text-claimondo-shield/60">
        {dateValid && (
          <>
            <time dateTime={lastModified.toISOString().slice(0, 10)}>
              Aktualisiert {lastModified.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}
            </time>
            <span aria-hidden>·</span>
          </>
        )}
        <span>Lesezeit ~{readingMin} Min</span>
        <span aria-hidden>·</span>
        <span>Redaktion Claimondo / LexDrive</span>
      </div>
    </header>
  )
}
