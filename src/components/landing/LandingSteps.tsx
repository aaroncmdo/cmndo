import { getTranslations } from 'next-intl/server'
import { FileText, Camera, Car } from 'lucide-react'
import { LandingCta } from '@/components/shared/LandingCta'

// AAR-465 L2: 3-Schritte-Explainer unterhalb der Trust-Section.
// Durchnummerierte Cards mit Icon/Titel/Beschreibung + abschließender
// CTA "Jetzt Schaden melden" + Duration-Hint.

const STEPS = [
  { num: 1, icon: FileText, key: 'step1' as const },
  { num: 2, icon: Camera, key: 'step2' as const },
  { num: 3, icon: Car, key: 'step3' as const },
]

export async function LandingSteps() {
  const t = await getTranslations('landing.steps')

  return (
    <section className="bg-claimondo-bg py-20" aria-labelledby="steps-heading">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <h2
            id="steps-heading"
            className="text-3xl font-bold text-claimondo-navy"
          >
            {t('heading')}
          </h2>
          <p className="mt-2 text-claimondo-ondo">{t('subheading')}</p>
        </div>

        <ol className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {STEPS.map((step) => {
            const Icon = step.icon
            return (
              <li
                key={step.num}
                className="relative rounded-2xl bg-white p-8 shadow-[var(--shadow-claimondo-sm)]"
              >
                <div
                  className="absolute -left-4 -top-4 flex h-10 w-10 items-center justify-center rounded-full bg-claimondo-navy font-bold text-white"
                  aria-hidden="true"
                >
                  {step.num}
                </div>
                <Icon
                  className="mb-4 h-8 w-8 text-claimondo-ondo"
                  aria-hidden="true"
                />
                <h3 className="text-lg font-semibold text-claimondo-navy">
                  {t(`${step.key}.title`)}
                </h3>
                <p className="mt-2 text-claimondo-ondo">
                  {t(`${step.key}.description`)}
                </p>
              </li>
            )
          })}
        </ol>

        <div className="mt-12 text-center">
          <LandingCta href="/schaden-melden" variant="primary">
            {t('cta')} →
          </LandingCta>
          <p className="mt-3 text-sm text-claimondo-ondo">{t('duration_hint')}</p>
        </div>
      </div>
    </section>
  )
}
