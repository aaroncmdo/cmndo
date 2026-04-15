import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Datenschutzerklaerung | Claimondo',
}

export default function DatenschutzPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 font-[family-name:var(--font-montserrat)]">
      {/* ENTWURF-Banner */}
      <div className="mb-8 rounded-lg bg-red-600 text-white px-4 py-3 text-sm font-semibold">
        ENTWURF &mdash; Diese Seite ist ein Entwurf. Anwalts-Review ausstehend.
      </div>

      <h1 className="text-3xl font-bold text-[#1E3A5F] mb-8">Datenschutzerklaerung</h1>

      <div className="space-y-8 text-[#1E3A5F]/90 leading-relaxed">
        {/* 1. Verantwortlicher */}
        <section>
          <h2 className="text-xl font-semibold text-[#1E3A5F] mb-3">1. Verantwortlicher</h2>
          <p>
            Claimondo GmbH i.G.<br />
            Hansaring 10<br />
            50670 Koeln<br />
            E-Mail: <a href="mailto:aaron.sprafke@claimondo.de" className="text-[#4573A2] underline">aaron.sprafke@claimondo.de</a>
          </p>
          <p className="mt-2">Geschaeftsfuehrer: Aaron Sprafke, Nicolas Kitta</p>
        </section>

        {/* 2. Welche Daten werden erhoben */}
        <section>
          <h2 className="text-xl font-semibold text-[#1E3A5F] mb-3">2. Welche Daten werden erhoben</h2>
          <p>Im Rahmen der Nutzung unserer Plattform erheben und verarbeiten wir folgende personenbezogene Daten:</p>
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li><strong>Authentifizierungsdaten:</strong> E-Mail-Adresse, Passwort (gehasht), Login-Zeitpunkte</li>
            <li><strong>Profildaten:</strong> Vorname, Nachname, Anrede, Titel, Telefonnummer, Adresse</li>
            <li><strong>Falldaten:</strong> Schadensinformationen, Fahrzeugdaten, Unfallhergang, Dokumente, Fotos</li>
            <li><strong>Zahlungsdaten:</strong> Abrechnungsinformationen (Kreditkartendaten werden ausschliesslich durch Stripe verarbeitet)</li>
            <li><strong>Kommunikationsdaten:</strong> E-Mail-Korrespondenz, SMS-Benachrichtigungen</li>
            <li><strong>Nutzungsdaten:</strong> Seitenaufrufe, Klickverhalten (anonymisiert)</li>
          </ul>
        </section>

        {/* 3. Zweck der Verarbeitung */}
        <section>
          <h2 className="text-xl font-semibold text-[#1E3A5F] mb-3">3. Zweck der Verarbeitung</h2>
          <p>Die Verarbeitung Ihrer Daten erfolgt zu folgenden Zwecken:</p>
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li>Bereitstellung und Betrieb der Plattform fuer KFZ-Schadensmanagement</li>
            <li>Vermittlung zwischen Geschaedigten, Sachverstaendigen und Kanzleien</li>
            <li>Abwicklung von Zahlungen und Abrechnungen</li>
            <li>Kommunikation per E-Mail und SMS im Rahmen der Fallbearbeitung</li>
            <li>Verbesserung unserer Dienste durch anonymisierte Nutzungsanalysen</li>
          </ul>
        </section>

        {/* 4. Rechtsgrundlage */}
        <section>
          <h2 className="text-xl font-semibold text-[#1E3A5F] mb-3">4. Rechtsgrundlage</h2>
          <p>Die Verarbeitung Ihrer personenbezogenen Daten erfolgt auf Grundlage von:</p>
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li><strong>Art. 6 Abs. 1 lit. b DSGVO</strong> &mdash; Erfuellung eines Vertrages oder vorvertraglicher Massnahmen (Nutzung der Plattform, Fallbearbeitung)</li>
            <li><strong>Art. 6 Abs. 1 lit. a DSGVO</strong> &mdash; Einwilligung (Cookies, Analytics, Marketing-Kommunikation)</li>
            <li><strong>Art. 6 Abs. 1 lit. f DSGVO</strong> &mdash; Berechtigtes Interesse (Fehlererkennung, Sicherheit, Plattform-Verbesserung)</li>
          </ul>
        </section>

        {/* 5. Auftragsverarbeiter */}
        <section>
          <h2 className="text-xl font-semibold text-[#1E3A5F] mb-3">5. Auftragsverarbeiter</h2>
          <p>Wir setzen folgende Dienstleister als Auftragsverarbeiter ein:</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-[#1E3A5F]/20">
                  <th className="text-left py-2 pr-4 font-semibold">Anbieter</th>
                  <th className="text-left py-2 pr-4 font-semibold">Sitz</th>
                  <th className="text-left py-2 font-semibold">Zweck</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E3A5F]/10">
                <tr>
                  <td className="py-2 pr-4">Supabase Inc.</td>
                  <td className="py-2 pr-4">USA (Standard Contractual Clauses)</td>
                  <td className="py-2">Datenbank, Authentifizierung, Dateispeicherung</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Vercel Inc.</td>
                  <td className="py-2 pr-4">USA (SCC)</td>
                  <td className="py-2">Hosting, CDN, Serverless Functions</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Stripe Payments Europe Ltd.</td>
                  <td className="py-2 pr-4">Irland</td>
                  <td className="py-2">Zahlungsabwicklung</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Twilio Ireland Ltd.</td>
                  <td className="py-2 pr-4">Irland</td>
                  <td className="py-2">SMS-Verifizierung</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Google Ireland Ltd.</td>
                  <td className="py-2 pr-4">Irland</td>
                  <td className="py-2">Maps, Calendar, OAuth, Vision API</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Resend Inc.</td>
                  <td className="py-2 pr-4">USA (sobald aktiv)</td>
                  <td className="py-2">E-Mail-Versand</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Functional Software Inc. (Sentry)</td>
                  <td className="py-2 pr-4">USA (sobald aktiv)</td>
                  <td className="py-2">Fehler-Monitoring, Performance-Tracking</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 6. Speicherdauer */}
        <section>
          <h2 className="text-xl font-semibold text-[#1E3A5F] mb-3">6. Speicherdauer</h2>
          <p>
            Wir speichern Ihre personenbezogenen Daten nur so lange, wie es fuer die Erfuellung
            der Verarbeitungszwecke erforderlich ist oder gesetzliche Aufbewahrungsfristen bestehen.
            Falldaten werden nach Abschluss des Schadensfalles und Ablauf der gesetzlichen
            Aufbewahrungsfrist (in der Regel 10 Jahre gemaess HGB/AO) geloescht.
            Kontodaten werden nach Kuendigung und Ablauf etwaiger Aufbewahrungsfristen entfernt.
          </p>
        </section>

        {/* 7. Rechte des Betroffenen */}
        <section>
          <h2 className="text-xl font-semibold text-[#1E3A5F] mb-3">7. Ihre Rechte</h2>
          <p>Sie haben gemaess DSGVO folgende Rechte:</p>
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li><strong>Auskunftsrecht</strong> (Art. 15 DSGVO) &mdash; Auskunft ueber Ihre gespeicherten Daten</li>
            <li><strong>Berichtigungsrecht</strong> (Art. 16 DSGVO) &mdash; Korrektur unrichtiger Daten</li>
            <li><strong>Loeschungsrecht</strong> (Art. 17 DSGVO) &mdash; Loeschung Ihrer Daten</li>
            <li><strong>Einschraenkung</strong> (Art. 18 DSGVO) &mdash; Einschraenkung der Verarbeitung</li>
            <li><strong>Datenuebertragbarkeit</strong> (Art. 20 DSGVO) &mdash; Erhalt Ihrer Daten in maschinenlesbarem Format</li>
            <li><strong>Widerspruchsrecht</strong> (Art. 21 DSGVO) &mdash; Widerspruch gegen die Verarbeitung</li>
          </ul>
          <p className="mt-2">
            Zur Ausuebung Ihrer Rechte wenden Sie sich bitte an:{' '}
            <a href="mailto:aaron.sprafke@claimondo.de" className="text-[#4573A2] underline">aaron.sprafke@claimondo.de</a>
          </p>
        </section>

        {/* 8. Beschwerderecht */}
        <section>
          <h2 className="text-xl font-semibold text-[#1E3A5F] mb-3">8. Beschwerderecht</h2>
          <p>
            Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehoerde zu beschweren.
            Die fuer uns zustaendige Aufsichtsbehoerde ist:
          </p>
          <p className="mt-2">
            Landesbeauftragte fuer Datenschutz und Informationsfreiheit Nordrhein-Westfalen<br />
            Postfach 20 04 44<br />
            40102 Duesseldorf<br />
            Telefon: 0211/38424-0<br />
            E-Mail: poststelle@ldi.nrw.de
          </p>
        </section>

        {/* Hinweis */}
        <div className="mt-8 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Hinweis:</strong> Diese Datenschutzerklaerung ist ein Entwurf und wurde noch
          nicht von einem Anwalt geprueft.
        </div>
      </div>
    </main>
  )
}
