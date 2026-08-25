import type { Metadata } from 'next'
import Link from 'next/link'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { SnippetText } from '@/components/content/SnippetText'
import { getCornerstones } from '@/lib/content/claimondo-mdx'
import { SITE_URL, WHATSAPP_HREF, jsonLdScript } from '@/lib/seo/jsonld'

// Author-Hub-Seite (geo-feeds-spec §5 Folge-Backlog): gibt dem Default-Feed-Author
// eine echte Person-Schema-URL (E-E-A-T / GEO) statt auf die Hauptseite zu zeigen
// (lib/feed/authors.ts url). de-only.
// HINWEIS Aaron: Bio = Erstentwurf — bitte verifizieren/ergaenzen (vgl. TODO in
// lib/seo/jsonld.ts FOUNDERS).

const WA = WHATSAPP_HREF
const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const
const AUTHOR_URL = `${SITE_URL}/autor/aaron-sprafke`
const LINKEDIN = 'https://www.linkedin.com/in/aaronsprafke/'
const SCHWERPUNKTE = [
  'Kfz-Schadenregulierung',
  'Kfz-Haftpflichtschaden',
  'Unfallschaden & § 249 BGB',
  'Kfz-Gutachten & Wertminderung',
  'Mietwagen & Nutzungsausfall',
  'Versicherer-Korrespondenz',
]

export const metadata: Metadata = {
  title: 'Aaron Sprafke – Mitgründer & COO von Claimondo',
  description:
    'Aaron Sprafke, Mitgründer und COO von Claimondo, über die Schadenregulierung für unverschuldet Geschädigte. Autor der Claimondo-Wissensinhalte.',
  alternates: { canonical: '/autor/aaron-sprafke' },
  openGraph: {
    type: 'profile',
    url: AUTHOR_URL,
    title: 'Aaron Sprafke – Mitgründer & COO von Claimondo',
    description: 'Mitgründer & COO von Claimondo. Autor der Wissensinhalte zur Kfz-Schadenregulierung.',
    locale: 'de_DE',
    siteName: 'Claimondo',
    images: [{ url: '/brand/team-headset.png', alt: 'Aaron Sprafke' }],
  },
}

export default function Page() {
  const artikel = getCornerstones()

  const personSchema = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: 'Aaron Sprafke',
    jobTitle: 'Mitgründer & COO',
    url: AUTHOR_URL,
    image: `${SITE_URL}/brand/team-headset.png`,
    sameAs: [LINKEDIN],
    worksFor: { '@type': 'Organization', name: 'Claimondo', url: SITE_URL },
    knowsAbout: SCHWERPUNKTE,
  }

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(personSchema)} />
      <LandingTopbar authenticatedUser={null} />
      <main className="mx-auto max-w-[920px] px-6 py-10">
        <nav className="mb-6 text-[0.8125rem] text-claimondo-shield" aria-label="Brotkrumen">
          <Link href="/" className="hover:text-claimondo-ondo">
            Start
          </Link>
          <span className="px-1.5 text-claimondo-light-blue">/</span>
          <span className="text-claimondo-navy">Aaron Sprafke</span>
        </nav>

        <header className="flex flex-col gap-6 sm:flex-row sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/team-headset.png"
            alt="Aaron Sprafke"
            width={112}
            height={112}
            className="h-28 w-28 shrink-0 rounded-full border border-claimondo-border object-cover"
          />
          <div>
            <h1 style={HEAD_FONT} className="text-3xl font-bold text-claimondo-navy">
              Aaron Sprafke
            </h1>
            <p className="mt-1 text-base font-medium text-claimondo-shield">
              Mitgründer & COO · Claimondo
            </p>
            <a
              href={LINKEDIN}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-claimondo-ondo transition-colors hover:text-claimondo-navy"
            >
              LinkedIn →
            </a>
          </div>
        </header>

        <section className="mt-8 max-w-3xl">
          <p className="text-base leading-relaxed text-claimondo-shield">
            Aaron Sprafke ist Mitgründer und COO von Claimondo. Mit Claimondo macht er die
            Schadenregulierung nach unverschuldetem Kfz-Unfall für Geschädigte kostenfrei,
            transparent und digital – von der unabhängigen Begutachtung über die Anwaltsanbindung
            bis zur Auszahlung. Er verantwortet die Wissensinhalte rund um Haftpflichtschaden,
            Versicherer-Praxis und Sachverständige und sorgt dafür, dass jeder Beitrag mit
            BGH-Bezug und einem konkreten nächsten Schritt erklärt ist.
          </p>
        </section>

        <section className="mt-8">
          <h2 style={HEAD_FONT} className="text-xl font-bold text-claimondo-navy">
            Schwerpunkte
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {SCHWERPUNKTE.map((s) => (
              <span
                key={s}
                className="rounded-full border border-claimondo-border bg-white px-3 py-1.5 text-[0.8125rem] font-medium text-claimondo-navy"
              >
                {s}
              </span>
            ))}
          </div>
        </section>

        <section className="mt-10 border-t border-claimondo-border pt-8">
          <h2 style={HEAD_FONT} className="text-xl font-bold text-claimondo-navy">
            Beiträge von Aaron Sprafke
          </h2>
          <div className="mt-4 grid gap-3.5 md:grid-cols-2">
            {artikel.map((a) => (
              <Link
                key={a.url}
                href={a.url}
                className="block rounded-ios-md border border-claimondo-border bg-white p-[18px] transition-colors hover:border-claimondo-ondo"
              >
                <h3 style={HEAD_FONT} className="font-bold leading-snug text-claimondo-navy">
                  {a.title}
                </h3>
                {a.snippet ? (
                  <p className="mt-1.5 line-clamp-2 text-[0.8125rem] leading-relaxed text-claimondo-shield">
                    <SnippetText>{a.snippet}</SnippetText>
                  </p>
                ) : null}
              </Link>
            ))}
          </div>
          <Link
            href="/wissen"
            className="mt-5 inline-flex text-sm font-semibold text-claimondo-ondo transition-colors hover:text-claimondo-navy"
          >
            Alle Wissens-Beiträge ansehen →
          </Link>
        </section>
      </main>
      <LandingFooter />
      <StickyCallBar quelle="Autor: Aaron Sprafke" whatsappHref={WA} />
    </div>
  )
}
