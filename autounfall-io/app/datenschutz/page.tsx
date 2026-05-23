import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Datenschutzerklärung',
  description:
    'Datenschutzerklärung von autounfall.io — welche Daten verarbeitet werden, Rechtsgrundlagen und Ihre Rechte nach DSGVO.',
  alternates: { canonical: '/datenschutz' },
}

// E-Mail ist aktuell Platzhalter (claimondo.de = Footprint, siehe site.ts).
const Email = () =>
  SITE.contactEmail ? (
    <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
  ) : (
    <em>(eigene autounfall.io-Adresse folgt vor Go-Live)</em>
  )

// STANDALONE (ENTITY-MODELL-LOCK v2): kein Claimondo im Text.
// §4: „Partner-Service Claimondo" entfernt — neutrale Beschreibung der Vermittlung.
// §7: nur die AKTUELL aktiven Auftragsverarbeiter (Hosting + Plausible). Die
//     form-bezogene Verarbeitung (sobald das Lead-Formular live ist, WP-6) ist
//     ein Platzhalter — NICHT raten.
//     TODO(Kevin/Aaron): Falls die Claimondo GmbH die Formular-Daten verarbeitet,
//     ist sie hier als Auftragsverarbeiter zu nennen (DSGVO-Pflicht, einzige
//     erlaubte Claimondo-Nennung). Erst nach Freigabe + WP-6 eintragen.
export default function DatenschutzPage() {
  return (
    <div className="container-prose px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight text-au-ink">
        Datenschutzerklärung
      </h1>

      <p className="mt-5 rounded-ios-md border border-au-amber/30 bg-au-amber-light/40 p-4 text-sm leading-relaxed text-au-ink-soft">
        <strong className="text-au-ink">Hinweis:</strong> Diese Datenschutzerklärung ist ein
        Entwurf und wurde noch nicht abschließend in Partnerschaft mit LexDrive freigegeben
        (anwaltliche Freigabe ausstehend). Sie beschreibt den aktuellen, statischen Stand von
        autounfall.io; mit Aktivierung von Anfrage-Formularen wird sie entsprechend ergänzt.
      </p>

      <div className="legal-prose mt-4">
        <h2>1. Verantwortlicher</h2>
        <p>
          {SITE.publisher.name}
          <br />
          {SITE.publisher.street}, {SITE.publisher.postalCode} {SITE.publisher.city}
          <br />
          Geschäftsführer: {SITE.publisher.managingDirectors}
          <br />
          E-Mail: <Email />
        </p>

        <h2>2. Aufruf der Website (Server-Logfiles)</h2>
        <p>
          Beim Aufruf von autounfall.io verarbeitet unser Hosting-Dienstleister technisch notwendige
          Zugriffsdaten (IP-Adresse, Datum/Uhrzeit, abgerufene Seite, übertragene Datenmenge,
          Browser-/Betriebssystem-Angaben). Diese Daten sind zur sicheren Auslieferung und Stabilität
          der Website erforderlich. Rechtsgrundlage: <strong>Art. 6 Abs. 1 lit. f DSGVO</strong>{' '}
          (berechtigtes Interesse an einem funktionsfähigen Angebot).
        </p>

        <h2>3. Interaktive Werkzeuge — lokale Speicherung</h2>
        <p>
          Unsere Werkzeuge (z. B. Unfallbericht-Tool, Kürzungs-Checker, Rechner für
          Nutzungsausfall/Schmerzensgeld) speichern Ihre Eingaben{' '}
          <strong>ausschließlich lokal in Ihrem Browser</strong> (localStorage). Es findet{' '}
          <strong>keine Übertragung dieser Eingaben an uns oder Dritte</strong> statt. Sie können die
          Daten jederzeit über Ihre Browser-Einstellungen löschen. Diese rein funktionale Speicherung
          ist einwilligungsfrei (§ 25 Abs. 2 TDDDG).
        </p>

        <h2>4. Kontaktaufnahme &amp; Anfragen</h2>
        <p>
          Wenn Sie uns per Telefon, E-Mail oder über ein Anfrage-Formular kontaktieren, verarbeiten
          wir die von Ihnen übermittelten Daten (z. B. Name, Kontaktdaten, Angaben zu Ihrem
          Schadensfall), um Ihre Anfrage zu bearbeiten und ggf. einen Sachverständigen oder eine
          Kanzlei zu vermitteln. Rechtsgrundlage: <strong>Art. 6 Abs. 1 lit. b und f DSGVO</strong>{' '}
          (vorvertragliche Maßnahmen, Bearbeitung Ihres Anliegens).
        </p>

        <h2>5. Schriftarten</h2>
        <p>
          Die verwendeten Schriftarten (Fraunces, Inter, JetBrains Mono) werden{' '}
          <strong>lokal von unserem eigenen Server ausgeliefert</strong> (selbst gehostet). Es findet{' '}
          <strong>keine Verbindung zu Google-Servern</strong> und keine Übertragung Ihrer IP-Adresse
          an Dritte zum Laden der Schriften statt.
        </p>

        <h2>6. Reichweitenmessung (Plausible Analytics)</h2>
        <p>
          Zur Verbesserung unseres Angebots nutzen wir <strong>Plausible Analytics</strong>, ein
          datenschutzfreundliches Web-Analyse-Tool. Plausible arbeitet <strong>cookielos</strong>,
          setzt keine geräteübergreifenden Identifikatoren, speichert keine personenbezogenen Daten
          und verarbeitet IP-Adressen nur anonymisiert. Erhoben werden ausschließlich aggregierte,
          anonyme Nutzungsstatistiken (z. B. Seitenaufrufe, Herkunftsland, Gerätetyp).
          Rechtsgrundlage: <strong>Art. 6 Abs. 1 lit. f DSGVO</strong>. Tracking- oder
          Marketing-Cookies setzen wir nicht.
        </p>

        <h2>7. Auftragsverarbeiter</h2>
        <table>
          <thead>
            <tr>
              <th>Anbieter</th>
              <th>Zweck</th>
              <th>Sitz</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Hosting-Dienstleister</td>
              <td>Auslieferung der Website, Server-Logs</td>
              <td>EU / SCC</td>
            </tr>
            <tr>
              <td>Plausible Insights OÜ</td>
              <td>cookielose, anonyme Reichweitenmessung</td>
              <td>EU (Estland)</td>
            </tr>
          </tbody>
        </table>
        <p>
          Sobald das Anfrage-Formular aktiv ist, werden die für die Bearbeitung und Vermittlung
          eingesetzten Auftragsverarbeiter hier ergänzt.
        </p>

        <h2>8. Speicherdauer</h2>
        <p>
          Wir speichern personenbezogene Daten nur so lange, wie es für den jeweiligen Zweck
          erforderlich ist oder gesetzliche Aufbewahrungsfristen es verlangen. Anfragedaten werden
          gelöscht, sobald sie für die Bearbeitung nicht mehr benötigt werden und keine
          Aufbewahrungspflichten entgegenstehen.
        </p>

        <h2>9. Ihre Rechte</h2>
        <p>
          Sie haben nach DSGVO das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung
          (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und
          Widerspruch (Art. 21). Zur Ausübung wenden Sie sich an <Email />.
        </p>

        <h2>10. Beschwerderecht</h2>
        <p>
          Sie können sich bei einer Datenschutz-Aufsichtsbehörde beschweren. Zuständig ist:
          <br />
          Landesbeauftragte für Datenschutz und Informationsfreiheit Nordrhein-Westfalen, Postfach
          20 04 44, 40102 Düsseldorf, Telefon 0211/38424-0,{' '}
          <a href="mailto:poststelle@ldi.nrw.de">poststelle@ldi.nrw.de</a>.
        </p>

        <p className="mt-6 text-sm">
          <Link href="/impressum">→ Impressum</Link>
        </p>
      </div>
    </div>
  )
}
