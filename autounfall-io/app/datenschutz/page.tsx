import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Datenschutzerklärung',
  description:
    'Datenschutzerklärung von autounfall.io — welche Daten verarbeitet werden, Rechtsgrundlagen und Ihre Rechte nach DSGVO.',
  alternates: { canonical: '/datenschutz' },
}

// STANDALONE: ausschliesslich Kitta & Sprafke UG. Claimondo GmbH ausschliesslich
// als Auftragsverarbeiter (§ 2 / § 5), kein claimondo.de-Link/-Branding.
// Finaler, von LexDrive freigegebener Text (12.06.2026) — 1:1 eingebaut, KEINE
// Entwurfs-/Review-Hinweise. Microsoft Clarity laeuft im Sofort-Betrieb mit
// Opt-out (Art. 6 Abs. 1 lit. f); Widerspruch ueber "Cookie-Einstellungen" im
// Seitenfuss (kommt mit dem Clarity-Punkt / Teil 2).
export default function DatenschutzPage() {
  return (
    <div className="container-prose px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight text-au-ink">
        Datenschutzerklärung
      </h1>

      <div className="legal-prose mt-6">
        <h2>1. Verantwortlicher</h2>
        <p>
          {SITE.publisher.name}, {SITE.publisher.street}, {SITE.publisher.postalCode}{' '}
          {SITE.publisher.city}. Geschäftsführer: {SITE.publisher.managingDirectors}. E-Mail:{' '}
          <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
        </p>

        <h2>2. Kontakt- und Anfragedaten</h2>
        <p>
          Wenn Sie uns über ein Anfrage-Formular, per E-Mail oder Telefon kontaktieren, verarbeiten
          wir die übermittelten Daten (z. B. Name, Kontaktdaten, Angaben zu Ihrem Schadensfall), um
          Ihre Anfrage zu bearbeiten und ggf. einen Sachverständigen oder eine Kanzlei zu vermitteln.
          Rechtsgrundlage: Art. 6 Abs. 1 lit. b und f DSGVO. Die Vermittlung und Abwicklung erfolgt
          durch die Claimondo GmbH als Auftragsverarbeiter (Art. 28 DSGVO).
        </p>

        <h2>3. Reichweitenmessung (Plausible Analytics)</h2>
        <p>
          Wir nutzen Plausible Analytics, ein cookieloses Web-Analyse-Tool. Plausible setzt keine
          geräteübergreifenden Identifikatoren, speichert keine personenbezogenen Daten und
          verarbeitet IP-Adressen nur anonymisiert; erhoben werden ausschließlich aggregierte,
          anonyme Statistiken. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO.
        </p>

        <h2>Ahrefs Web Analytics</h2>
        <p>
          Wir nutzen Ahrefs Web Analytics, einen cookielosen Webanalysedienst der Ahrefs Pte. Ltd.,
          16 Raffles Quay, #33-03 Hong Leong Building, Singapur 048581 („Ahrefs“). Ahrefs Web
          Analytics verwendet keine Cookies und legt keine geräteübergreifenden Kennungen an. Zur
          Reichweitenmessung werden aggregierte, nicht auf einzelne Personen rückführbare
          Nutzungsdaten (u. a. aufgerufene Seiten, Referrer, ungefährer Standort auf Länderebene,
          Browser-/Gerätetyp) verarbeitet.
        </p>
        <p>
          Rechtsgrundlage ist unser berechtigtes Interesse an einer statistischen Analyse des
          Nutzungsverhaltens zur Optimierung unseres Angebots gemäß Art. 6 Abs. 1 lit. f DSGVO. Da
          Ahrefs seinen Sitz in Singapur — einem Drittland ohne Angemessenheitsbeschluss der
          EU-Kommission — hat, erfolgt die Übermittlung auf Grundlage der EU-Standardvertragsklauseln
          (Art. 46 Abs. 2 lit. c DSGVO). Weitere Informationen unter ahrefs.com/legal/privacy-policy.
        </p>

        <h2>4. Heatmaps und Sitzungsanalyse (Microsoft Clarity)</h2>
        <p>
          Wir nutzen Microsoft Clarity (Anbieter: Microsoft Ireland Operations Ltd., Irland;
          Übermittlung an Microsoft Corporation, USA) zur Verbesserung der Nutzerführung mittels
          Heatmaps und maskierter Sitzungsaufzeichnungen. Dabei werden Cookies (u. a. <code>_clck</code>,{' '}
          <code>_clsk</code>) gesetzt; die Übermittlung in die USA erfolgt auf Grundlage des EU-US
          Data Privacy Framework bzw. der Standardvertragsklauseln. Eingaben in Formulare werden
          maskiert. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an der
          Analyse und Verbesserung unseres Angebots). Sie können dieser Verarbeitung jederzeit mit
          Wirkung für die Zukunft widersprechen — über „Cookie-Einstellungen“ im Seitenfuß (Art. 21
          DSGVO).
        </p>
        <p>
          Hinweis zu Cookies: Die Reichweitenmessung (Plausible) erfolgt cookielos. Microsoft Clarity
          ist standardmäßig aktiv und setzt Cookies; Sie können dem jederzeit widersprechen (Opt-out
          über „Cookie-Einstellungen“).
        </p>

        <h2>5. Auftragsverarbeiter</h2>
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
              <td>Plausible Insights OÜ</td>
              <td>cookielose, anonyme Reichweitenmessung</td>
              <td>EU (Estland)</td>
            </tr>
            <tr>
              <td>Claimondo GmbH / Supabase Inc.</td>
              <td>Bearbeitung von Anfragen &amp; Vermittlung (sobald Formulare aktiv)</td>
              <td>DE / USA (SCC)</td>
            </tr>
            <tr>
              <td>Microsoft Ireland Operations Ltd.</td>
              <td>Heatmaps/Sitzungsanalyse (Clarity), Opt-out möglich</td>
              <td>IE / USA (DPF/SCC)</td>
            </tr>
            <tr>
              <td>Ahrefs Pte. Ltd.</td>
              <td>Webanalyse (cookieless)</td>
              <td>Singapur (SCC)</td>
            </tr>
          </tbody>
        </table>

        <h2>6. Speicherdauer</h2>
        <p>
          Wir speichern personenbezogene Daten nur so lange, wie es für die Verarbeitungszwecke
          erforderlich ist oder gesetzliche Aufbewahrungsfristen bestehen.
        </p>

        <h2>7. Ihre Rechte</h2>
        <p>
          Sie haben das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17),
          Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch
          (Art. 21). Zur Ausübung wenden Sie sich an{' '}
          <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
        </p>

        <h2>8. Beschwerderecht</h2>
        <p>
          Sie können sich bei einer Datenschutz-Aufsichtsbehörde beschweren. Zuständig ist die
          Landesbeauftragte für Datenschutz und Informationsfreiheit Nordrhein-Westfalen, Postfach 20
          04 44, 40102 Düsseldorf.
        </p>

        <h2>9. Cookies und Widerspruch</h2>
        <p>
          Beim ersten Besuch informiert ein Hinweisbanner über den Einsatz von Microsoft Clarity und
          verweist auf diese Datenschutzerklärung. Sie können dem Einsatz jederzeit widersprechen
          (Opt-out über „Cookie-Einstellungen“ im Seitenfuß).
        </p>

        <p className="mt-6 text-sm">
          <Link href="/impressum">→ Impressum</Link>
        </p>
      </div>
    </div>
  )
}
