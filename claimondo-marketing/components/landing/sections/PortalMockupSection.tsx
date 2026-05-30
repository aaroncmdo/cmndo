import { Phone } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

// Portal-Mockup „Wie Uber — nur für Ihren Kfz-Schaden" aus prototype.html §6.
// 5 nummerierte Features links + Glass-Card-Mockup rechts mit Fall-ID,
// Progress 3/12, „Mein Geld"-Aufschlüsselung, Berater-Card.
//
// AAR-UWG-Fix 14.05.2026: Markenrechts-Disclaimer für „Uber" am unteren
// Sektionsende ergänzt — die Headline bleibt als analoger Vergleich
// zulässig, sofern klargestellt ist, dass keine Geschäftsbeziehung
// besteht (BGH I ZR 51/14 „Markenparodie" / §23 MarkenG).

type FeatureItem = { titel: string; text: string }

export async function PortalMockupSection() {
  const t = await getTranslations('wie_es_funktioniert.portal')

  const features = t.raw('features') as FeatureItem[]

  return (
    <section className="relative isolate overflow-hidden bg-claimondo-navy py-20 text-white sm:py-28" aria-labelledby="portal-heading">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            'radial-gradient(circle at 20% 30%, rgba(69,115,162,0.28), transparent 55%)',
            'radial-gradient(circle at 80% 70%, rgba(123,163,204,0.18), transparent 50%)',
          ].join(', '),
        }}
      />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-claimondo-light-blue">
            {t('eyebrow')}
          </p>
          <h2 id="portal-heading" className="mt-3 text-3xl font-bold leading-[1.05] tracking-[-0.02em] sm:text-5xl">
            {t('heading_pre')}<br />
            <span className="text-claimondo-light-blue">{t('heading_accent')}</span>
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-white/75">
            {t('sub')}
          </p>
          <ul className="mt-8 space-y-4" role="list">
            {features.map((f, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-claimondo-light-blue/20 text-sm font-bold text-claimondo-light-blue">
                  {i + 1}
                </span>
                <div>
                  <p className="font-semibold text-white">{f.titel}</p>
                  <p className="text-sm text-white/70">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Glass-Card Fall-Mockup */}
        <div>
          <div className="mx-auto max-w-md rounded-3xl border border-white/60 bg-white/85 p-6 text-claimondo-navy shadow-claimondo-lg backdrop-blur-xl sm:p-7">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">{t('mockup_fall_label')}</p>
                <p className="text-base font-bold">CLM-2026-0518-K</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />
                {t('mockup_status')}
              </span>
            </div>

            <div className="mt-5">
              <div className="flex justify-between text-[10px] font-semibold uppercase text-claimondo-shield/60">
                <span>{t('mockup_schritt')}</span>
                <span>25 %</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-claimondo-border/60" role="progressbar" aria-label={t('mockup_fortschritt_aria')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={25}>
                <div
                  className="h-full bg-gradient-to-r from-claimondo-ondo to-claimondo-light-blue"
                  style={{ width: '25%' }}
                />
              </div>
            </div>

            <div className="mt-6 rounded-2xl bg-claimondo-bg p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
                {t('mockup_geld_eyebrow')}
              </p>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-claimondo-shield">{t('mockup_reparatur')}</dt>
                  <dd className="font-semibold">4.820 €</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-claimondo-shield">{t('mockup_wertminderung')}</dt>
                  <dd className="font-semibold">850 €</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-claimondo-shield">{t('mockup_mietwagen')}</dt>
                  <dd className="font-semibold">480 €</dd>
                </div>
                <div className="mt-1.5 flex justify-between border-t border-claimondo-border pt-1.5">
                  <dt className="font-bold">{t('mockup_gesamt')}</dt>
                  <dd className="font-bold text-claimondo-navy">6.150 €</dd>
                </div>
              </dl>
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-claimondo-border bg-white/80 p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-claimondo-ondo/20 font-bold text-claimondo-ondo">
                MM
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-claimondo-navy">Marcel M.</p>
                <p className="text-xs text-claimondo-shield">{t('mockup_berater_antwort')}</p>
              </div>
              <a
                href="tel:+4922125906530"
                className="rounded-full bg-claimondo-navy p-2 text-white hover:bg-claimondo-shield"
                data-tracking="portal-mock-call"
                aria-label={t('mockup_berater_aria')}
              >
                <Phone className="h-4 w-4" aria-hidden />
              </a>
            </div>
          </div>
          <p className="mx-auto mt-6 max-w-md px-2 text-center text-[11px] leading-relaxed text-white/55">
            {t('uber_disclaimer')}
          </p>
        </div>
      </div>
    </section>
  )
}
