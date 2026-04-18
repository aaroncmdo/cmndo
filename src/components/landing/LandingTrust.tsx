import { getTranslations } from 'next-intl/server'
import { Shield, Scale, Sparkles } from 'lucide-react'

// AAR-465 L2: Trust-Section unterhalb des Hero. 3-Spalten-Grid mit
// Icon/Titel/Beschreibung. Server-Component mit getTranslations
// (konsistent zu LandingHero).

const FEATURES = [
  { icon: Shield, key: 'independent' as const },
  { icon: Scale, key: 'regulation' as const },
  { icon: Sparkles, key: 'all_in_one' as const },
]

export async function LandingTrust() {
  const t = await getTranslations('landing.trust')

  return (
    <section className="bg-white py-16" aria-labelledby="trust-heading">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2
          id="trust-heading"
          className="mb-12 text-center text-3xl font-bold text-claimondo-navy"
        >
          {t('heading')}
        </h2>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {FEATURES.map((f) => {
            const Icon = f.icon
            return (
              <div key={f.key} className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-claimondo-ondo/10">
                  <Icon className="h-7 w-7 text-claimondo-ondo" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-claimondo-navy">
                  {t(`${f.key}.title`)}
                </h3>
                <p className="mt-2 text-slate-600">{t(`${f.key}.description`)}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
