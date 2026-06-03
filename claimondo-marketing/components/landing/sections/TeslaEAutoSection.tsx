// Tesla / E-Auto-Spezialfall-Callout aus prototype.html §9b.
// 1/3-2/3 Grid auf claimondo-shield (etwas heller als navy), Wissensdatenbank §16.

import { getTranslations } from 'next-intl/server'

export async function TeslaEAutoSection() {
  const t = await getTranslations('vorteile.tesla')

  return (
    <section className="bg-claimondo-shield py-14 text-white" aria-labelledby="tesla-heading">
      <div className="mx-auto grid max-w-5xl items-center gap-8 px-5 md:grid-cols-[1fr_2fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-claimondo-light-blue">
            {t('eyebrow')}
          </p>
          <h2 id="tesla-heading" className="mt-3 text-2xl font-bold leading-tight sm:text-3xl">
            {t('heading_line1')}<br />
            {t('heading_line2')}
          </h2>
        </div>
        <div className="space-y-3 text-sm leading-relaxed text-white/85">
          <p>
            {t('p1_pre')}{' '}
            <strong>{t('p1_strong')}</strong>{' '}
            {t('p1_mid')} <strong>{t('p1_betrag')}</strong>{t('p1_suf')}
          </p>
          <p>
            {t('p2_pre')} <em>{t('p2_em')}</em>{' '}
            {t('p2_suf')}
          </p>
          <p className="text-xs text-claimondo-light-blue">
            {t('quelle')}
          </p>
        </div>
      </div>
    </section>
  )
}
