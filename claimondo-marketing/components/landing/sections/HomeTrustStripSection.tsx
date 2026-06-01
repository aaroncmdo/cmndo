import { getTranslations } from 'next-intl/server'
import { GoogleReviews } from '@/components/shared/GoogleReviews'

// Phase D2 — Home-Trust-Strip (premium, home-spezifisch).
// Vorher ein duenner Wrapper um die generische TrustStripSection (8 Pages teilen sie).
// Jetzt eigene, auf der Home-Flagship-Bar gebaute KPI-Band-Version: Bass-Zahlen +
// Treble-Labels, luftiges Rhythmus (section-audit §7). Die generische
// TrustStripSection bleibt unveraendert fuer die 7 anderen Pages (Stadt, /vorteile,
// /wie-es-funktioniert, /faq, /ueber-uns, /schadensreport, /ersteinschaetzung).
//
// KPIs + Methodik 1:1 aus home.kpis / home.kpi_methodik (real + UWG-konform mit
// Quellen-Fussnote, §9). Google-Reviews-Slot (Task E1) ist markiert — wird erst mit
// echten Daten gerendert (nie erfundene Bewertungen, UWG §5).

export async function HomeTrustStripSection() {
  const t = await getTranslations('home')

  const kpis = t.raw('kpis') as { wert: string; label: string }[]
  const kpiMethodik = t('kpi_methodik')

  return (
    <section className="border-b border-claimondo-border/60 bg-white" aria-label="Kennzahlen">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:py-16 lg:px-8">
        <ul className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
          {kpis.map((k) => (
            <li key={k.label} className="text-center">
              <div className="text-4xl font-extrabold leading-none tracking-tight text-claimondo-navy sm:text-5xl">
                {k.wert}
              </div>
              <div className="mx-auto mt-4 h-px w-8 bg-claimondo-ondo/40" aria-hidden />
              <div className="mt-3 text-xs font-medium uppercase tracking-wide text-claimondo-ondo sm:text-[13px]">
                {k.label}
              </div>
            </li>
          ))}
        </ul>

        <p className="mx-auto mt-10 max-w-3xl text-center text-[11px] leading-relaxed text-claimondo-shield/70">
          {kpiMethodik}
        </p>

        {/* E1 — LIVE Google-Bewertungen (null-safe: rendert nichts ohne echte Daten). */}
        <GoogleReviews />
      </div>
    </section>
  )
}
