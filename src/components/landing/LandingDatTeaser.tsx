import { getTranslations } from 'next-intl/server'
import { Calculator } from 'lucide-react'
import { LandingCta } from '@/components/shared/LandingCta'

// AAR-466 L3: Call-out-Box für DAT-Ersteinschätzung. Dunkler
// Navy-Hintergrund, hebt sich visuell vom darüberliegenden Steps-Block
// ab. Route /ersteinschaetzung existiert noch nicht — 404 akzeptiert,
// kommt in separatem Ticket (siehe Ticket "Nicht in diesem Ticket").

export async function LandingDatTeaser() {
  const t = await getTranslations('landing.dat_teaser')

  return (
    <section className="bg-claimondo-navy py-16 text-white" aria-labelledby="dat-heading">
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
        <Calculator
          className="mx-auto mb-4 h-12 w-12 text-claimondo-ondo"
          aria-hidden="true"
        />
        <h2 id="dat-heading" className="text-3xl font-bold">
          {t('heading')}
        </h2>
        <p className="mt-4 text-claimondo-light-blue">{t('description')}</p>
        <LandingCta
          href="/ersteinschaetzung"
          variant="secondary"
          className="mt-8 border-transparent bg-white text-claimondo-navy hover:bg-claimondo-bg"
        >
          {t('cta')} →
        </LandingCta>
        <p className="mt-3 text-sm text-slate-300">{t('duration_hint')}</p>
      </div>
    </section>
  )
}
