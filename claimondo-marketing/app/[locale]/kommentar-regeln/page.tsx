import type { Metadata } from 'next'
import Link from 'next/link'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { SITE_URL, OG_DEFAULT_IMAGES } from '@/lib/seo/jsonld'

// Kommentar-Regeln / Netiquette fuer die Artikel-Kommentare. DPIA-Launch-Gate-Massnahme
// (operationalisiert R1/R2/R7: keine Selbst-/Dritt-Daten, kein Rechtsrat, keine Impersonation)
// + Notice-and-Takedown-Hinweis. Aus dem Kommentar-Formular und dem Disclaimer verlinkt.
// Entwurf — Wording von Aaron/Anwalt final zu pruefen. de-only (vgl. /wissen).

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

export const metadata: Metadata = {
  title: 'Kommentar-Regeln',
  description:
    'Die Regeln für Kommentare unter den Wissens-Artikeln von Claimondo: respektvoller Umgang, keine sensiblen oder fremden personenbezogenen Daten, kein Rechtsrat. Jeder Kommentar wird vor Veröffentlichung geprüft.',
  alternates: { canonical: '/kommentar-regeln' },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/kommentar-regeln`,
    title: 'Kommentar-Regeln',
    description:
      'Wie wir Kommentare unter den Wissens-Artikeln moderieren – und was beim Kommentieren bitte zu beachten ist.',
    locale: 'de_DE',
    siteName: 'Claimondo',
    images: OG_DEFAULT_IMAGES,
  },
}

const VERBOTEN: { titel: string; text: string }[] = [
  {
    titel: 'Keine sensiblen Daten über dich selbst',
    text: 'Verzichte auf Gesundheits- und Verletzungsdetails, Finanzangaben oder genaue Angaben zu deinem Fall. Kommentare sind öffentlich und werden von Suchmaschinen erfasst.',
  },
  {
    titel: 'Keine Daten über andere Personen',
    text: 'Keine Klarnamen, Kennzeichen oder Adressen Dritter – und keine namentlichen Vorwürfe gegen Werkstätten, Sachverständige, Versicherer oder einzelne Mitarbeitende.',
  },
  {
    titel: 'Kein Rechtsrat',
    text: 'Kommentare ersetzen keine anwaltliche Beratung. Bitte gib anderen keine verbindlichen rechtlichen Handlungsempfehlungen.',
  },
  {
    titel: 'Keine Werbung, kein Spam, keine Links',
    text: 'Für noch nicht freigeschaltete Konten sind Links automatisch gesperrt.',
  },
  {
    titel: 'Keine Beleidigungen, keine Hetze, keine Diskriminierung',
    text: 'Ein sachlicher, respektvoller Ton ist Voraussetzung.',
  },
  {
    titel: 'Keine Identitätstäuschung',
    text: 'Wähle keinen Nutzernamen, der vorgibt, Claimondo, ein Anwalt oder eine Behörde zu sein.',
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
          <span className="text-claimondo-navy">Kommentar-Regeln</span>
        </nav>

        <header className="max-w-2xl">
          <h1 style={HEAD_FONT} className="text-3xl font-bold text-claimondo-navy">
            Kommentar-Regeln
          </h1>
          <p className="mt-4 text-base leading-relaxed text-claimondo-shield">
            Unter unseren Wissens-Artikeln kannst du kommentieren, Fragen stellen und Erfahrungen
            teilen. Damit das ein hilfreicher und respektvoller Ort bleibt, gelten die folgenden
            Regeln. <strong className="text-claimondo-navy">Jeder Kommentar wird vor der
            Veröffentlichung geprüft.</strong>
          </p>
        </header>

        <section className="mt-9">
          <h2 style={HEAD_FONT} className="text-xl font-bold text-claimondo-navy">
            Erwünscht
          </h2>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-claimondo-shield">
            Sachliche Fragen, eigene Erfahrungen, hilfreiche Hinweise – und ein freundlicher Ton
            gegenüber anderen.
          </p>
        </section>

        <section className="mt-8">
          <h2 style={HEAD_FONT} className="text-xl font-bold text-claimondo-navy">
            Bitte nicht
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
            Prüfung &amp; Melden
          </h2>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-claimondo-shield">
            Wir prüfen jeden Kommentar vor der Veröffentlichung. Veröffentlichte Kommentare kannst du
            über die Funktion „Melden" kennzeichnen – wir sehen sie uns an und entfernen
            Regelverstöße. Konten, die wiederholt gegen diese Regeln verstoßen, können gesperrt
            werden.
          </p>
        </section>

        <p className="mt-9 border-t border-claimondo-border pt-6 text-[0.8125rem] leading-relaxed text-claimondo-shield/80">
          Kommentare geben die Meinung der Verfasser:innen wieder, nicht die von Claimondo. Wie wir
          deine Daten verarbeiten, steht in der{' '}
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
