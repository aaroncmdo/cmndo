'use client'

import Image from 'next/image'
import { LinkIcon, Quote } from 'lucide-react'

// Founder-Section für E-E-A-T (Experience, Expertise, Authority, Trust).
// Person-Schemas + echte Bios + Foto + LinkedIn = Google-Trust-Boost.
//
// TODO Aaron: Bio-Texte sind Erstentwurf. Bitte überschreiben sobald ihr
// die finalen Versionen habt.

const FOUNDERS = [
  {
    name: 'Nicolas Kitta',
    rolle: 'CEO & Mitgründer',
    bio:
      'Nicolas führt Claimondo und ist Ansprechpartner für Versicherungs-Partnerschaften und strategische Kanzlei-Kooperationen. Sein Antrieb: Schadensregulierung in Deutschland transparent und auf Augenhöhe machen — ohne Versicherer-Standardgespräche, ohne Kürzungslogik.',
    quote:
      '"Es geht nicht darum wer ich bin, sondern was ich tue. Daran wird man gemessen." — Batman',
    foto: '/brand/team-founders.png',
    fotoPosition: 'right',
    linkedin: 'https://www.linkedin.com/in/nicolas-kitta-451947246/',
  },
  {
    name: 'Aaron Sprafke',
    rolle: 'COO & Mitgründer',
    bio:
      'Aaron verantwortet bei Claimondo Operations, Produkt und Tech-Plattform. Mit Hintergrund in Sales und Account-Management bei nextright und AdvoScale weiß er, wo der Hebel zwischen Kundenversprechen und realer Auszahlung liegt. Aaron ist die Schnittstelle zwischen Gutachtern, Anwälten und unserer Software.',
    quote:
      '"Qualität bedeutet, es richtig zu machen, wenn niemand zuschaut." — Henry Ford',
    foto: '/brand/team-founders.png',
    fotoPosition: 'left',
    linkedin: 'https://www.linkedin.com/in/aaron-sprafke-355085237/',
  },
]

export function FounderSection() {
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
            Wer steht hinter Claimondo
          </p>
          <h2
            id="founders-heading"
            className="mt-3 text-4xl font-extrabold tracking-tight text-claimondo-navy sm:text-5xl"
          >
            Echte Menschen.<br className="hidden sm:block" /> Kein Callcenter.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-claimondo-ondo">
            Wir wissen wie es ist, nach einem Unfall einer Versicherung gegenüberzustehen.
            Genau deshalb haben wir Claimondo gegründet.
          </p>
        </div>

        {/* Hero-Foto beider Founders */}
        <div className="relative mx-auto mt-12 max-w-3xl overflow-hidden rounded-3xl shadow-2xl ring-1 ring-claimondo-border">
          <Image
            src="/brand/team-founders.png"
            alt="Aaron Sprafke (COO) und Nicolas Kitta (CEO) — die Gründer von Claimondo im Kölner Office"
            width={1200}
            height={600}
            className="h-auto w-full"
            priority
          />
        </div>

        {/* Bios */}
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {FOUNDERS.map((f) => (
            <article
              key={f.name}
              className="glass-card rounded-3xl p-6 shadow-glass-card"
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
                  aria-label={`${f.name} auf LinkedIn`}
                  itemProp="sameAs"
                >
                  <LinkIcon className="h-5 w-5" />
                </a>
              </header>

              <p className="mt-4 text-sm leading-relaxed text-claimondo-shield" itemProp="description">
                {f.bio}
              </p>

              <blockquote className="glass-card-sm mt-5 flex gap-3 rounded-xl border-l-4 border-claimondo-ondo p-4">
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
