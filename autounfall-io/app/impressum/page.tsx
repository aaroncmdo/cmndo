import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Impressum',
  description:
    'Impressum von autounfall.io — Kitta & Sprafke UG (haftungsbeschränkt), Köln. Angaben gemäß § 5 DDG.',
  alternates: { canonical: '/impressum' },
}

// STANDALONE: ausschliesslich Kitta & Sprafke UG, kein Claimondo-Branding/-Link.
// Finaler, von LexDrive freigegebener Text (12.06.2026) — 1:1 eingebaut, KEINE
// Entwurfs-/Review-Hinweise. Kein EU-OS-Plattform-Link (Plattform zum 20.07.2025
// abgeschaltet) → nur die VSBG-Erklaerung.
//
// Aenderung 03.09.2026 (Aaron): Handelsregister nachgetragen — „Amtsgericht Koeln —
// Eintragung in Vorbereitung" → „Amtsgericht Koeln, HRB 128389". Damit ist die
// Firmierung erstmals in sich stimmig: der Text nannte die Gesellschaft schon
// „UG (haftungsbeschraenkt)" ohne „i.G.", fuehrte die Eintragung aber als offen —
// eine UG entsteht erst MIT der Eintragung (§ 11 Abs. 1 GmbHG analog).
// ⚠ Die USt-IdNr. steht weiterhin auf „in Beantragung" (unten) — kein Wert vorhanden.
// ⚠ Die Nummer gehoert der Kitta & Sprafke UG. Die Claimondo GmbH ist ein EIGENER
// Rechtstraeger, weiterhin „i.G." und ohne Registernummer.
export default function ImpressumPage() {
  const phoneHref = `tel:${SITE.phone.replace(/[^+\d]/g, '')}`
  return (
    <div className="container-prose px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight text-au-ink">
        Impressum
      </h1>

      <div className="legal-prose mt-6">
        <h2>Angaben gemäß § 5 DDG</h2>
        <p>
          <strong>{SITE.publisher.name}</strong>
          <br />
          {SITE.publisher.street}
          <br />
          {SITE.publisher.postalCode} {SITE.publisher.city}
        </p>

        <h2>Vertreten durch</h2>
        <p>{SITE.publisher.managingDirectors}</p>

        <h2>Kontakt</h2>
        <p>
          E-Mail: <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
          <br />
          Telefon: <a href={phoneHref}>{SITE.phone}</a>
        </p>

        <h2>Handelsregister</h2>
        {/* Bewusst EIN Template-Literal statt {court}, {number}: getrennte JSX-Kinder
            rendert React als getrennte Textknoten und schiebt `<!-- -->`-Marker
            dazwischen. Im Quelltext stuende dann „Amtsgericht Köln<!-- -->, <!-- -->HRB
            128389" — fuer Menschen unsichtbar, fuer Crawler/LLMs unnoetiges Rauschen
            auf genau der Seite, die die Entitaet belegen soll. */}
        <p>{`${SITE.publisher.registerCourt}, ${SITE.publisher.registerNumber}`}</p>

        <h2>Umsatzsteuer-Identifikationsnummer</h2>
        <p>Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: in Beantragung</p>

        <h2>Redaktionell verantwortlich (§ 18 Abs. 2 MStV)</h2>
        <p>
          Nicolas Kitta, {SITE.publisher.street}, {SITE.publisher.postalCode}{' '}
          {SITE.publisher.city}. Inhaltliche Begleitung in Zusammenarbeit mit unserer
          Verkehrsrechts-Partnerkanzlei.
        </p>

        <h2>Haftung für Inhalte / externe Links</h2>
        <p>
          Die Inhalte wurden mit Sorgfalt erstellt; eine Gewähr für Richtigkeit, Vollständigkeit und
          Aktualität wird nicht übernommen. autounfall.io ist ein allgemeines Informations- und
          Ratgeber-Angebot und ersetzt keine individuelle Rechtsberatung. Für Inhalte externer Links
          sind ausschließlich deren Betreiber verantwortlich.
        </p>

        <h2>Verbraucherstreitbeilegung (§ 36 VSBG)</h2>
        <p>
          Wir sind nicht verpflichtet und nicht bereit, an einem Streitbeilegungsverfahren vor einer
          Verbraucherschlichtungsstelle teilzunehmen.
        </p>

        <p className="mt-6 text-sm">
          <Link href="/datenschutz">→ Datenschutzerklärung</Link>
        </p>
      </div>
    </div>
  )
}
