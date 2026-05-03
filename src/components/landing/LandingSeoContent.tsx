import { getTranslations } from 'next-intl/server'
import Link from 'next/link'

// AAR-466 L3: SEO-Content-Section mit 4 Fragen-basierten Topic-Cards.
// Links zeigen auf /ratgeber/<slug> — Routen existieren noch nicht
// (post-MVP SEO-Blog, 404 akzeptiert).

const TOPICS = ['polizei', 'werkstatt', 'rechtsschutz', 'totalschaden'] as const

export async function LandingSeoContent() {
  const t = await getTranslations('landing.seo')

  return (
    <section className="bg-white py-20" aria-labelledby="seo-heading">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2
          id="seo-heading"
          className="mb-4 text-center text-3xl font-bold text-claimondo-navy"
        >
          {t('heading')}
        </h2>
        <p className="mb-12 text-center text-claimondo-ondo">{t('subheading')}</p>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {TOPICS.map((topic) => (
            <article
              key={topic}
              className="rounded-xl border border-claimondo-border p-6 transition hover:shadow-[var(--shadow-claimondo-sm)]"
            >
              <h3 className="text-lg font-semibold text-claimondo-navy">
                {t(`${topic}.question`)}
              </h3>
              <p className="mt-2 text-claimondo-ondo">{t(`${topic}.teaser`)}</p>
              <Link
                href={`/ratgeber/${topic}`}
                className="mt-4 inline-block font-semibold text-claimondo-ondo hover:underline"
              >
                {t('read_more')} →
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
