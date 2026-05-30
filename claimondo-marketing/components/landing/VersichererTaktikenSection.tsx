import Link from 'next/link'
import { AlertTriangle, ShieldOff, FileWarning, ChevronRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

// Versicherer-Taktiken-Section für Hauptseite + Conversion-Pages.
// Wissensdatenbank §2 (Prüfberichte) + §15 (Schadensteuerungs-Taktiken).
// GEO-Pattern „Statistics Addition" + „Authoritative Tone" mit ControlExpert /
// K-Expert / DEKRA-Nennung + Versicherer-spezifischen Mustern (HUK, LVM, AXA).

// hrefs sind keine UI-Strings → lokal behalten (gleiche Reihenfolge wie de.json-Array).
const TAKTIK_HREFS = [
  '/decoder/werkstatt-netz',
  '/versicherung-schickt-gutachter',
  '/decoder/wir-pruefen-sachverhalt',
  '/haftpflicht/wiederbeschaffungswert',
  '/decoder/wir-pruefen-sachverhalt',
  '/haftpflicht/sv-kosten',
] as const

export async function VersichererTaktikenSection() {
  const t = await getTranslations('home')

  type TaktikRow = {
    trigger: string
    versicherer: string
    pruefdienstleister: string
    kuerzung: string
    gegenargument: string
    bgh: string
    href: string
  }

  const taktiken = (t.raw('versicherer_taktiken.taktiken') as Array<Omit<TaktikRow, 'href'>>).map(
    (item, i) => ({ ...item, href: TAKTIK_HREFS[i] }),
  )

  return (
    <section
      className="relative bg-claimondo-navy py-20 text-white sm:py-24"
      aria-labelledby="versicherer-taktiken-heading"
    >
      {/* Subtle radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(123,163,204,.12) 0%, transparent 70%)',
        }}
        aria-hidden
      />

      <div className="relative z-10 mx-auto max-w-6xl px-5 sm:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-claimondo-light-blue backdrop-blur-md">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            {t('versicherer_taktiken.badge')}
          </div>
          <h2
            id="versicherer-taktiken-heading"
            className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl"
          >
            {t('versicherer_taktiken.heading')}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/75">
            {t.rich('versicherer_taktiken.intro', {
              ce: (chunks) => <strong className="text-white">{chunks}</strong>,
              ke: (chunks) => <strong className="text-white">{chunks}</strong>,
              dekra: (chunks) => <strong className="text-white">{chunks}</strong>,
            })}
          </p>
        </div>

        <div className="mt-12 overflow-x-auto rounded-ios-md border border-white/10 bg-white/[0.04] backdrop-blur-md">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-white/[0.03]">
              <tr className="text-xs uppercase tracking-wider text-claimondo-light-blue">
                <th scope="col" className="px-5 py-4 font-semibold">
                  {t('versicherer_taktiken.col_trigger')}
                </th>
                <th scope="col" className="px-5 py-4 font-semibold">
                  {t('versicherer_taktiken.col_wer')}
                </th>
                <th scope="col" className="px-5 py-4 font-semibold">
                  {t('versicherer_taktiken.col_kuerzung')}
                </th>
                <th scope="col" className="px-5 py-4 font-semibold">
                  {t('versicherer_taktiken.col_gegenargument')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {taktiken.map((item) => (
                <tr key={item.trigger} className="align-top">
                  <td className="px-5 py-4">
                    <div className="font-bold text-white">{item.trigger}</div>
                    <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-claimondo-light-blue">
                      <ShieldOff className="h-3 w-3" aria-hidden />
                      {item.bgh}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-white/80">
                    <div className="font-semibold">{item.versicherer}</div>
                    <div className="mt-0.5 flex items-start gap-1.5 text-xs text-white/60">
                      <FileWarning className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden />
                      {item.pruefdienstleister}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-white/80 leading-relaxed">
                    {item.kuerzung}
                  </td>
                  <td className="px-5 py-4 text-white leading-relaxed">
                    {item.gegenargument}
                    <Link
                      href={item.href}
                      className="group mt-3 flex w-fit items-center gap-1 text-xs font-semibold text-claimondo-light-blue transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-claimondo-light-blue"
                      aria-label={`${item.trigger} — was BGH-fest gilt`}
                      data-tracking={`card-taktik-${item.trigger.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}
                    >
                      {t('versicherer_taktiken.link_cta')}
                      <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" aria-hidden />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-8 text-center text-xs text-white/60">
          {t('versicherer_taktiken.quellen')}
        </p>
      </div>
    </section>
  )
}
