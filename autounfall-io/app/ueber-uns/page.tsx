import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Über uns',
  description:
    'autounfall.io ist ein unabhängiges, werbefreies Ratgeber-Angebot der Kitta & Sprafke UG aus Köln — Rechte nach dem Kfz-Unfall, fachlich begleitet von einer Verkehrsrechts-Partnerkanzlei.',
  alternates: { canonical: '/ueber-uns' },
}

// STANDALONE E-E-A-T-Seite (Paket A1): Redaktion, Methodik, Finanzierung.
// Ausschliesslich Kitta & Sprafke UG, kein Claimondo-/LexDrive-Footprint; die
// Kanzlei bleibt generisch ("Verkehrsrechts-Partnerkanzlei"). Adresse + Kontakt
// aus SITE (DRY, deckungsgleich mit Impressum). AboutPage/Organization-JSON-LD
// folgt additiv in Paket A3 (Schema), hier bewusst nur Seiteninhalt + Metadata.
export default function UeberUnsPage() {
  const phoneHref = `tel:${SITE.phone.replace(/[^+\d]/g, '')}`
  return (
    <div className="container-prose px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight text-au-ink">
        Über autounfall.io
      </h1>

      <div className="quick-answer mb-8 mt-6 rounded-ios-md bg-au-ink p-7 text-au-surface sm:p-8">
        <div className="quick-answer-prose text-lg leading-relaxed">
          <p>
            <strong>Quick Answer:</strong> autounfall.io ist ein unabhängiges, werbefreies
            Ratgeber-Angebot der {SITE.publisher.name} aus {SITE.publisher.city}. Wir erklären
            unverschuldet Geschädigten verständlich und mit BGH-Rechtsprechung belegt ihre Rechte
            nach einem Kfz-Unfall — fachlich begleitet von einer Verkehrsrechts-Partnerkanzlei.
          </p>
        </div>
      </div>

      <div className="legal-prose">
        <h2>Wer hinter autounfall.io steht</h2>
        <p>
          autounfall.io ist ein redaktionelles Angebot der <strong>{SITE.publisher.name}</strong>,{' '}
          {SITE.publisher.street}, {SITE.publisher.postalCode} {SITE.publisher.city}. Wir sind
          unabhängig von Versicherern und deren Prüfdiensten.
        </p>

        <h2>Unsere Mission</h2>
        <p>
          Die meisten Menschen haben ein- bis zweimal im Leben einen Kfz-Unfall — und stehen dann
          einem eingespielten System aus Versicherern und Prüfdiensten gegenüber. Wir geben ihnen
          verständliches, belastbares Wissen an die Hand, damit sie auf Augenhöhe sind und bekommen,
          was ihnen zusteht.
        </p>

        <h2>Wie wir arbeiten (Redaktion &amp; Prüfung)</h2>
        <p>
          Alle Inhalte werden redaktionell erstellt, mit den einschlägigen{' '}
          <strong>Gesetzen (insb. § 249 BGB)</strong> und der{' '}
          <strong>höchstrichterlichen Rechtsprechung des Bundesgerichtshofs</strong> belegt und
          regelmäßig aktualisiert. Die fachliche Einordnung erfolgt in{' '}
          <strong>
            Partnerschaft mit einer auf Verkehrsrecht spezialisierten Kanzlei (Fachanwalt für
            Verkehrsrecht)
          </strong>
          . Quellen geben wir auf jeder Seite an. Unsere Inhalte sind allgemeine Informationen und
          ersetzen <strong>keine</strong> individuelle Rechtsberatung.
        </p>

        <h2>Warum das Angebot kostenlos ist (Transparenz)</h2>
        <p>
          Wir finanzieren uns <strong>nicht</strong> über Werbung und verkaufen{' '}
          <strong>keine</strong> Nutzerdaten. Auf Wunsch vermitteln wir Geschädigte an{' '}
          <strong>unabhängige Kfz-Sachverständige</strong> oder eine{' '}
          <strong>Verkehrsrechts-Kanzlei</strong> — aus dieser Vermittlung trägt sich das
          redaktionelle Angebot. Die Nutzung der Ratgeber, Rechner und des Decoders bleibt kostenlos
          und unverbindlich.
        </p>

        <h2>Kontakt</h2>
        <p>
          E-Mail: <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
          <br />
          Telefon: <a href={phoneHref}>{SITE.phone}</a>
        </p>

        <p className="mt-6 text-sm">
          <Link href="/impressum">→ Impressum</Link> ·{' '}
          <Link href="/datenschutz">→ Datenschutzerklärung</Link>
        </p>
      </div>
    </div>
  )
}
