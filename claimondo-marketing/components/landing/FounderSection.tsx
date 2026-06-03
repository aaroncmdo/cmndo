'use client'

import Image from 'next/image'
import { LinkIcon, Quote } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { FOUNDER_NICOLAS_NAME, FOUNDER_AARON_NAME } from '@/lib/seo/brand-constants'

// Founder-Section für E-E-A-T (Experience, Expertise, Authority, Trust).
// Person-Schemas + echte Bios + Foto + LinkedIn = Google-Trust-Boost.
//
// TODO Aaron: Bio-Texte sind Erstentwurf. Bitte überschreiben sobald ihr
// die finalen Versionen habt.

// LinkedIn-Hrefs + Foto: kein übersetzbarer UI-String → lokal.
// Namen kommen aus brand-constants (kanonisch).
// Reihenfolge entspricht home.founder.founders[0/1] in de.json.
const FOUNDERS_META = [
  {
    name: FOUNDER_NICOLAS_NAME,
    linkedin: 'https://www.linkedin.com/in/nicolas-kitta-451947246/',
    foto: '/brand/team-founders.png',
  },
  {
    name: FOUNDER_AARON_NAME,
    linkedin: 'https://www.linkedin.com/in/aaronsprafke/',
    foto: '/brand/team-founders.png',
  },
]

export function FounderSection() {
  const t = useTranslations('home')

  type FounderText = { rolle: string; bio: string; quote: string }
  const foundersText = t.raw('founder.founders') as FounderText[]

  const founders = FOUNDERS_META.map((meta, i) => ({
    ...meta,
    rolle: foundersText[i].rolle,
    bio: foundersText[i].bio,
    quote: foundersText[i].quote,
  }))

  return (
    <section
      className="relative overflow-hidden bg-claimondo-bg py-20"
      aria-labelledby="founders-heading"
      style={{
        backgroundImage:
          'radial-gradient(65% 55% at 15% 100%, rgba(123,163,204,.15), transparent 65%)',
      }}
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
            {t('founder.eyebrow')}
          </p>
          <h2
            id="founders-heading"
            className="mt-3 text-4xl font-extrabold tracking-tight text-claimondo-navy sm:text-5xl"
          >
            {t('founder.heading_plain')}<br className="hidden sm:block" /> {t('founder.heading_accent')}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-claimondo-ondo">
            {t('founder.sub')}
          </p>
        </div>

        {/* Hero-Foto beider Founders */}
        <div className="relative mx-auto mt-12 max-w-3xl overflow-hidden rounded-ios-lg shadow-2xl ring-1 ring-claimondo-border">
          <Image
            src="/brand/team-founders.png"
            alt={t('founder.foto_alt')}
            width={1200}
            height={600}
            className="h-auto w-full"
            priority
          />
        </div>

        {/* Bios */}
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {founders.map((f) => (
            <article
              key={f.name}
              className="glass-card rounded-ios-lg p-6 shadow-glass-card"
              itemScope
              itemType="https://schema.org/Person"
            >
              <header className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-extrabold text-claimondo-navy" itemProp="name">
                    {f.name}
                  </h3>
                  <p className="text-sm font-semibold text-claimondo-ondo" itemProp="jobTitle">
                    {f.rolle}
                  </p>
                </div>
                <a
                  href={f.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full p-2 text-claimondo-ondo hover:bg-white hover:text-[#0A66C2]"
                  aria-label={t('founder.linkedin_aria', { name: f.name })}
                  itemProp="sameAs"
                >
                  <LinkIcon className="h-5 w-5" />
                </a>
              </header>

              <p className="mt-4 text-sm leading-relaxed text-claimondo-shield" itemProp="description">
                {f.bio}
              </p>

              <blockquote className="glass-card-sm mt-5 flex gap-3 rounded-ios-md border-l-4 border-claimondo-ondo p-4">
                <Quote className="h-4 w-4 flex-shrink-0 text-claimondo-light-blue" />
                <p className="text-sm italic text-claimondo-shield">{f.quote}</p>
              </blockquote>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
