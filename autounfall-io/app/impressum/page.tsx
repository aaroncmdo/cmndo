import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Impressum',
  description:
    'Impressum von autounfall.io — Kitta & Sprafke UG (haftungsbeschränkt), Köln. Angaben gemäß § 5 DDG.',
  alternates: { canonical: '/impressum' },
}

// STANDALONE: kein Claimondo. Die im Prototyp vorhandene „Transparenz"-Passage
// (Partner-Service Claimondo) ist bewusst entfernt (ENTITY-MODELL-LOCK v2) — die
// Seite ist aktuell ein reines Ratgeber-Angebot, ein zu nennender Vermittlungs-
// Dienstleister entsteht erst mit dem Lead-Formular (WP-6, dann Kevin-Freigabe).
export default function ImpressumPage() {
  return (
    <div className="container-prose px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight text-au-ink">
        Impressum
      </h1>

      <p className="mt-5 rounded-ios-md border border-au-amber/30 bg-au-amber-light/40 p-4 text-sm leading-relaxed text-au-ink-soft">
        <strong className="text-au-ink">Hinweis:</strong> Dieses Impressum ist ein Entwurf. Die
        anwaltliche Prüfung (LexDrive) und die finalen Registereinträge stehen noch aus.
      </p>

      <div className="legal-prose mt-4">
        <h2>Angaben gemäß § 5 DDG (Digitale-Dienste-Gesetz)</h2>
        <p>
          <strong>{SITE.publisher.name}</strong>
          <br />
          {SITE.publisher.street}
          <br />
          {SITE.publisher.postalCode} {SITE.publisher.city}
          <br />
          {SITE.publisher.country}
        </p>

        <h2>Vertreten durch</h2>
        <p>Geschäftsführer: {SITE.publisher.managingDirectors}</p>

        <h2>Kontakt</h2>
        <p>
          Telefon:{' '}
          {SITE.phone ? (
            <a href={`tel:${SITE.phone.replace(/[^+\d]/g, '')}`}>{SITE.phone}</a>
          ) : (
            <em>(eigene autounfall.io-Nummer folgt vor Go-Live)</em>
          )}
          <br />
          E-Mail:{' '}
          {SITE.contactEmail ? (
            <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
          ) : (
            <em>(eigene autounfall.io-Adresse folgt vor Go-Live)</em>
          )}
        </p>

        <h2>Handelsregister</h2>
        <p>Eintragung in Vorbereitung (Amtsgericht Köln). Registernummer wird nach Eintragung ergänzt.</p>

        <h2>Umsatzsteuer-Identifikationsnummer</h2>
        <p>USt-IdNr. gemäß § 27 a UStG: in Beantragung.</p>

        <h2>Redaktionell verantwortlich (§ 18 Abs. 2 MStV)</h2>
        <p>
          Nicolas Kitta, {SITE.publisher.street}, {SITE.publisher.postalCode}{' '}
          {SITE.publisher.city}. Inhaltliche Begleitung in Partnerschaft mit der
          Verkehrsrechts-Kanzlei{' '}
          <a href={SITE.legalReviewer.url} rel="noopener" target="_blank">
            {SITE.legalReviewer.name}
          </a>
          .
        </p>

        <h2>EU-Streitschlichtung</h2>
        <p>
          Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{' '}
          <a href="https://ec.europa.eu/consumers/odr/" rel="noopener" target="_blank">
            https://ec.europa.eu/consumers/odr/
          </a>
          . Wir sind nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer
          Verbraucherschlichtungsstelle teilzunehmen.
        </p>

        <h2>Haftung für Inhalte &amp; keine Rechtsberatung</h2>
        <p>
          autounfall.io ist ein allgemeines Informations- und Ratgeber-Angebot und ersetzt{' '}
          <strong>keine individuelle Rechtsberatung</strong>. Trotz sorgfältiger inhaltlicher
          Kontrolle übernehmen wir keine Haftung für die Richtigkeit, Vollständigkeit und Aktualität
          der Inhalte. Für Inhalte externer Links sind ausschließlich deren Betreiber verantwortlich.
        </p>

        <p className="mt-6 text-sm">
          <Link href="/datenschutz">→ Datenschutzerklärung</Link>
        </p>
      </div>
    </div>
  )
}
