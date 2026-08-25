import type { Metadata } from 'next'
import Link from 'next/link'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { SITE_URL, OG_DEFAULT_IMAGES } from '@/lib/seo/jsonld'

// Community-Regeln / B2B-Netiquette fuer den Partner-Feed auf der Startseite.
// DPIA-Massnahme (Identitaet ist oeffentlich / kein Rechtsrat / keine Drittdaten).
// Notice-and-Takedown + Moderationshinweis. Aus PostComposer und CommunityFeedSection verlinkt.
// Entwurf — Wording von Aaron/Anwalt final zu pruefen.

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

export const metadata: Metadata = {
  title: 'Community-Regeln',
  description:
    'Die Regeln für die Claimondo-Partner-Community: fachlicher Austausch unter Sachverständigen, Maklern und Werkstätten – respektvoll, ohne Rechtsrat und ohne Drittdaten.',
  alternates: { canonical: '/community-regeln' },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/community-regeln`,
    title: 'Community-Regeln',
    description:
      'Netiquette für die B2B-Community von Claimondo – was im Partner-Feed erlaubt ist und was nicht.',
    locale: 'de_DE',
    siteName: 'Claimondo',
    images: OG_DEFAULT_IMAGES,
  },
}

const VERBOTEN: { titel: string; text: string }[] = [
  {
    titel: 'Keine Schmähung von Firmen oder Wettbewerbern',
    text: 'Namentliche Herabsetzungen konkreter Unternehmen, Versicherer, Werkstätten oder einzelner Personen sind nicht gestattet. Sachliche Kritik an Praktiken – ohne Namensnennung – bleibt erlaubt.',
  },
  {
    titel: 'Kein Rechtsrat',
    text: 'Die Community dient dem allgemeinen fachlichen Austausch, nicht der Einzelfallberatung. Verbindliche rechtliche Handlungsempfehlungen für konkrete Fälle Dritter sind unzulässig – das gilt auch für Anwälte. Für Rechtsrat bitte die offiziellen Kanäle nutzen.',
  },
  {
    titel: 'Keine personenbezogenen Daten Dritter',
    text: 'Keine Kennzeichen, Namen von Geschädigten, Mandanten oder Verfahrensbeteiligten, keine Adressen oder sonstigen PII-Daten aus laufenden oder abgeschlossenen Fällen.',
  },
  {
    titel: 'Keine vertraulichen Fall- oder Vergleichsdaten',
    text: 'Gutachteninhalte, Schätzwerte, Vergleichsbeträge oder ähnliche Informationen aus konkreten Fällen dürfen nicht veröffentlicht werden – auch nicht anonymisiert, wenn der Fall rekonstruierbar ist.',
  },
  {
    titel: 'Keine Werbung, kein Spam',
    text: 'Eigenwerbung, Dienstleistungsangebote, Preislisten und externe Links zu kommerziellen Angeboten sind nicht gestattet. Fachliche Quellen (Urteile, Normen, Verbandsdokumente) können verlinkt werden.',
  },
  {
    titel: 'Kein Identitätsbetrug',
    text: 'Beiträge erscheinen unter dem Firmennamen des verifizierten Partners. Eine Darstellung als andere Person, anderes Unternehmen oder als Claimondo-Redaktion ist verboten.',
  },
]

export default function Page() {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <LandingTopbar authenticatedUser={null} />
      <main className="mx-auto max-w-[760px] px-6 py-10">
        <nav className="mb-6 text-[0.8125rem] text-claimondo-shield" aria-label="Brotkrumen">
          <Link href="/" className="hover:text-claimondo-ondo">
            Start
          </Link>
          <span className="px-1.5 text-claimondo-light-blue">/</span>
          <span className="text-claimondo-navy">Community-Regeln</span>
        </nav>

        <header className="max-w-2xl">
          <h1 style={HEAD_FONT} className="text-3xl font-bold text-claimondo-navy">
            Netiquette der Claimondo-Community
          </h1>
          <p className="mt-4 text-base leading-relaxed text-claimondo-shield">
            Der Partner-Feed ist ein Ort für den fachlichen Austausch unter Kfz-Schaden-Profis —
            Sachverständige, Makler und Werkstätten berichten aus der Praxis, teilen Erfahrungen und
            diskutieren Branchenthemen. Damit das konstruktiv bleibt, gelten die folgenden Regeln.
          </p>
          <p className="mt-2.5 text-base leading-relaxed text-claimondo-shield">
            <strong className="text-claimondo-navy">Identität ist öffentlich:</strong> Beiträge von
            verifizierten Partnern erscheinen unter dem{' '}
            <strong className="text-claimondo-navy">Firmennamen</strong>. Beiträge der Redaktion
            sind als <strong className="text-claimondo-navy">„Redaktion"</strong> gekennzeichnet.
          </p>
        </header>

        <section className="mt-9">
          <h2 style={HEAD_FONT} className="text-xl font-bold text-claimondo-navy">
            Erwünscht
          </h2>
          <ul className="mt-2 space-y-1.5 text-[0.9375rem] leading-relaxed text-claimondo-shield">
            <li>Fachliche Beiträge mit Praxisbezug aus dem Kfz-Schadenbereich</li>
            <li>Quellenangaben bei Urteilen, Normen oder statistischen Daten</li>
            <li>Sachliche Meinungen und konstruktive Kritik an Branchenpraktiken</li>
            <li>Hinweise auf relevante Änderungen in Regulierung, Rechtsprechung oder Technik</li>
            <li>Ein respektvoller, professioneller Umgangston</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 style={HEAD_FONT} className="text-xl font-bold text-claimondo-navy">
            Nicht gestattet
          </h2>
          <ol className="mt-3 space-y-3.5">
            {VERBOTEN.map((r, i) => (
              <li
                key={r.titel}
                className="rounded-ios-md border border-claimondo-border bg-white p-4"
              >
                <div className="flex gap-3">
                  <span
                    style={HEAD_FONT}
                    className="shrink-0 text-[0.8125rem] font-bold text-claimondo-light-blue"
                  >
                    {i + 1}.
                  </span>
                  <div>
                    <div className="text-[0.9375rem] font-semibold text-claimondo-navy">
                      {r.titel}
                    </div>
                    <p className="mt-0.5 text-[0.875rem] leading-relaxed text-claimondo-shield">
                      {r.text}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-8">
          <h2 style={HEAD_FONT} className="text-xl font-bold text-claimondo-navy">
            Melden &amp; Moderation
          </h2>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-claimondo-shield">
            Jeden Beitrag und jeden Kommentar kannst du über die Funktion{' '}
            <strong className="text-claimondo-navy">„Melden"</strong> kennzeichnen. Mehrfach
            gemeldete Inhalte werden automatisch vorübergehend ausgeblendet, bis die Redaktion sie
            geprüft hat (Notice-and-Takedown). Die Redaktion kann Beiträge verbergen oder entfernen
            und Konten bei wiederholten Verstößen sperren.
          </p>
        </section>

        <p className="mt-9 border-t border-claimondo-border pt-6 text-[0.8125rem] leading-relaxed text-claimondo-shield/80">
          Beiträge und Kommentare geben die Meinung der jeweiligen Verfasser:innen wieder, nicht die
          von Claimondo. Wie wir Daten verarbeiten, steht in der{' '}
          <Link href="/datenschutz" className="underline hover:text-claimondo-ondo">
            Datenschutzerklärung
          </Link>
          .
        </p>
      </main>
      <LandingFooter />
    </div>
  )
}
