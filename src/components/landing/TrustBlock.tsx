import { ShieldCheck, Award, Scale } from 'lucide-react'

// AAR-883: Shared Trust-Block für Conversion-Pages. Drei Partner-Pillars
// (DAT, BVSK, LexDrive) + optionale Stat-Strip. Schließt CORE-EEAT-R-
// Dimension auf Pages mit Trust-Lücke (vorher unter 70 im 13.05.2026-Audit).
//
// Bewusst kein aggregateRating — wird erst hinzugefügt wenn echte
// Trustpilot-/Google-Reviews vorliegen (Schema.org-Spam-Strafe sonst).
// Bewusst keine Bilder/Logo-Files — Text-Pills mit lucide-Icons sind
// performant, asset-frei und visuell konsistent mit dem Claimondo-Glass-
// Pattern.

type Stat = { wert: string; label: string }

type Props = {
  /** Optionale Stat-Zeile unter den Partner-Pills (z. B. „89+ DAT-Partner"). */
  stats?: Stat[]
  /** Heading über dem Block. Default: „Mit anerkannten Partnern". */
  heading?: string
}

const PARTNER = [
  {
    icon: ShieldCheck,
    title: 'DAT Expert Partner',
    subtitle: 'Sachverständigen-Netzwerk',
    url: 'https://www.dat.de/sachverstaendige/',
  },
  {
    icon: Award,
    title: 'BVSK-Mitglieder',
    subtitle: 'Bundesverband freier Sachverständiger',
    url: 'https://www.bvsk.de/',
  },
  {
    icon: Scale,
    title: 'LexDrive',
    subtitle: 'Partnerkanzlei Verkehrsrecht',
    url: 'https://lexdrive.de/',
  },
] as const

export function TrustBlock({
  stats,
  heading = 'Mit anerkannten Partnern',
}: Props) {
  return (
    <section className="border-y border-claimondo-border/40 bg-white/50 py-10 sm:py-12">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-claimondo-ondo">
          {heading}
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3 sm:gap-4">
          {PARTNER.map((p) => {
            const Icon = p.icon
            return (
              <a
                key={p.title}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 rounded-ios-md border border-white/60 bg-white/70 px-4 py-3 shadow-glass-card backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-claimondo-ondo/40 hover:bg-white/90"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-ios-md bg-claimondo-ondo/10">
                  <Icon className="h-5 w-5 text-claimondo-ondo" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold leading-tight text-claimondo-navy">
                    {p.title}
                  </p>
                  <p className="mt-0.5 text-xs leading-tight text-claimondo-shield">
                    {p.subtitle}
                  </p>
                </div>
              </a>
            )
          })}
        </div>
        {stats && stats.length > 0 && (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-ios-md border border-white/60 bg-white/60 p-4 text-center backdrop-blur-md"
              >
                <div className="text-xl font-bold tracking-tight text-claimondo-navy sm:text-2xl">
                  {s.wert}
                </div>
                <p className="mt-1 text-[11px] font-semibold leading-tight text-claimondo-ondo">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
