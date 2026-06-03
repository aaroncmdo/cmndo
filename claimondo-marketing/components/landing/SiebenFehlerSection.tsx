import Link from 'next/link'
import {
  AlertOctagon, Camera, ShieldX, FileX,
  PhoneOff, Wrench, Clock4, Video,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

// Sieben-Fehler-Section für Hauptseite + Conversion-Pages.
// Wissensdatenbank §12 — typische Fehler nach Unfall.
// GEO-Pattern „Easy-to-Understand" (numbered steps) + „Cite Sources" (ADAC,
// Verbraucherzentrale, Fenderl/Hertfelder).

// Icons + hrefs lokal — gleiche Reihenfolge wie de.json home.sieben_fehler.fehler
const FEHLER_META: { icon: LucideIcon; href: string }[] = [
  { icon: PhoneOff,     href: '/decoder/werkstatt-netz' },
  { icon: ShieldX,      href: '/versicherung-schickt-gutachter' },
  { icon: FileX,        href: '/decoder/pauschal-abgeltung' },
  { icon: AlertOctagon, href: '/decoder/unser-sachverstaendiger' },
  { icon: Wrench,       href: '/decoder/wertminderung-nicht' },
  { icon: Camera,       href: '/haftpflicht/anscheinsbeweis' },
  { icon: Video,        href: '/haftpflicht/beweislast' },
]

export async function SiebenFehlerSection() {
  const t = await getTranslations('home')

  type FehlerText = { titel: string; warum: string; besser: string; href: string }
  const fehlerTexte = t.raw('sieben_fehler.fehler') as Array<Omit<FehlerText, 'href'>>

  const fehler = fehlerTexte.map((item, i) => ({
    nummer: i + 1,
    titel: item.titel,
    warum: item.warum,
    besser: item.besser,
    icon: FEHLER_META[i].icon,
    href: FEHLER_META[i].href,
  }))

  return (
    <section
      className="relative bg-white py-20 sm:py-24"
      aria-labelledby="sieben-fehler-heading"
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-red-700">
            <Clock4 className="h-3.5 w-3.5" aria-hidden />
            {t('sieben_fehler.badge')}
          </div>
          <h2
            id="sieben-fehler-heading"
            className="mt-5 text-3xl font-extrabold tracking-tight text-claimondo-navy sm:text-4xl"
          >
            {t('sieben_fehler.heading')}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-claimondo-shield">
            {t('sieben_fehler.sub')}
          </p>
        </div>

        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="list">
          {fehler.map((f) => {
            const Icon = f.icon
            return (
              <li
                key={f.nummer}
                className="group relative flex flex-col rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5 transition-all hover:-translate-y-0.5 hover:border-claimondo-ondo/30 hover:bg-white focus-within:ring-2 focus-within:ring-claimondo-ondo"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-ios-md bg-claimondo-navy text-base font-extrabold text-white">
                    {f.nummer}
                  </span>
                  <Icon
                    className="h-5 w-5 text-claimondo-ondo"
                    aria-hidden
                  />
                </div>
                <h3 className="mt-4 text-base font-bold leading-snug text-claimondo-navy">
                  {f.titel}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">
                  <span className="font-semibold text-red-700">{t('sieben_fehler.warum_label')}</span> {f.warum}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">
                  <span className="font-semibold text-emerald-700">{t('sieben_fehler.besser_label')}</span> {f.besser}
                </p>
                {/* Doc 41 §5.3: Pattern B — Pseudo-Link ueber die ganze Card (keine verschachtelten Interactives). */}
                <span className="mt-auto pt-4 text-xs font-semibold text-claimondo-ondo group-hover:text-claimondo-navy">
                  {t('sieben_fehler.card_cta')}
                </span>
                <Link
                  href={f.href}
                  className="absolute inset-0 z-10 rounded-ios-md focus:outline-none"
                  aria-label={`Fehler ${f.nummer}: ${f.titel} — Lösung im Detail`}
                  data-tracking={`card-fehler-${f.nummer}`}
                >
                  <span className="sr-only">Mehr erfahren</span>
                </Link>
              </li>
            )
          })}
        </ol>

        <p className="mt-10 text-center text-xs text-claimondo-shield/70">
          {t('sieben_fehler.quellen')}
        </p>
      </div>
    </section>
  )
}
