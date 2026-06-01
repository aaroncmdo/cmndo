import Link from 'next/link'
import { ShieldAlert, MapPin, TrendingUp } from 'lucide-react'

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

interface Props {
  /** H1-Titel des Hubs (aus MD-Frontmatter/Title). */
  title: string
  marktanteilPct: number
  /** BaFin-Beschwerdequote 2024; null = offiziell nicht ausgewiesen. */
  bafinQuote: number | null
  /** Branchenschnitt fuer den Vergleich (Default 2,2 — BAFIN_BRANCHENSCHNITT_2024). */
  branchenschnitt?: number
  hauptsitz: string
  cta: { href: string; label: string }
}

/**
 * Hero einer Versicherer-Hub-Detailseite: H1 + Kennzahlen-Zeile
 * (Marktanteil, BaFin-Quote vs. Schnitt, Hauptsitz) + CTA. (CONTRACT F-20)
 */
export function VersichererHero({
  title,
  marktanteilPct,
  bafinQuote,
  branchenschnitt = 2.2,
  hauptsitz,
  cta,
}: Props) {
  const ueberSchnitt = bafinQuote !== null && bafinQuote > branchenschnitt
  return (
    <header className="border-b border-claimondo-border pb-7">
      <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-claimondo-ondo">
        <span className="h-1.5 w-1.5 rounded-full bg-claimondo-light-blue" aria-hidden />
        Versicherer-Hub
      </div>
      <h1
        style={HEAD_FONT}
        className="max-w-3xl text-balance text-4xl font-extrabold leading-[1.08] tracking-tight text-claimondo-navy md:text-5xl"
      >
        {title}
      </h1>
      <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-4">
        <div>
          <dt className="text-[0.8125rem] font-semibold uppercase tracking-wide text-claimondo-shield/60">
            Marktanteil
          </dt>
          <dd className="mt-0.5 flex items-center gap-1.5 text-xl font-bold text-claimondo-navy">
            <TrendingUp className="h-4 w-4 text-claimondo-ondo" aria-hidden />
            ca.&nbsp;{marktanteilPct.toLocaleString('de-DE')}&nbsp;%
          </dd>
        </div>
        <div>
          <dt className="text-[0.8125rem] font-semibold uppercase tracking-wide text-claimondo-shield/60">
            BaFin-Beschwerdequote 2024
          </dt>
          <dd
            className={`mt-0.5 flex items-center gap-1.5 text-xl font-bold ${
              ueberSchnitt ? 'text-red-600' : 'text-claimondo-navy'
            }`}
          >
            <ShieldAlert
              className={`h-4 w-4 ${ueberSchnitt ? 'text-red-600' : 'text-claimondo-ondo'}`}
              aria-hidden
            />
            {bafinQuote !== null ? bafinQuote.toLocaleString('de-DE') : 'nicht ausgewiesen'}
            {bafinQuote !== null && (
              <span className="text-sm font-normal text-claimondo-shield/60">
                &nbsp;/ Schnitt {branchenschnitt.toLocaleString('de-DE')}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[0.8125rem] font-semibold uppercase tracking-wide text-claimondo-shield/60">
            Hauptsitz
          </dt>
          <dd className="mt-0.5 flex items-center gap-1.5 text-xl font-bold text-claimondo-navy">
            <MapPin className="h-4 w-4 text-claimondo-ondo" aria-hidden />
            {hauptsitz}
          </dd>
        </div>
      </dl>
      <Link
        href={cta.href}
        className="mt-7 inline-flex items-center gap-2 rounded-ios-md bg-claimondo-navy px-6 py-3 text-base font-bold text-white shadow-claimondo-sm transition hover:bg-claimondo-ondo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-claimondo-ondo"
      >
        {cta.label}
      </Link>
    </header>
  )
}
