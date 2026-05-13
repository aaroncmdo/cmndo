import type { Metadata } from 'next'
import PageHeader from '@/components/shared/PageHeader'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'

export const metadata: Metadata = {
  title: 'Datenschutzerklärung | Claimondo',
}

export default function DatenschutzPage() {
  return (
    <main className="relative min-h-screen bg-claimondo-bg font-[family-name:var(--font-montserrat)]">
      {/* Ambient-Gradient */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: [
            'radial-gradient(60% 50% at 80% 0%, rgba(123,163,204,0.18), transparent 60%)',
            'radial-gradient(50% 50% at 0% 100%, rgba(69,115,162,0.08), transparent 70%)',
          ].join(', '),
        }}
      />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* ENTWURF-Banner */}
        <div className="mb-8 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-5 py-3.5 text-sm font-semibold text-amber-900 shadow-claimondo-md backdrop-blur-sm">
          ENTWURF &mdash; Diese Seite ist ein Entwurf. Anwalts-Review ausstehend.
        </div>

        <div className="mb-8">
          <PageHeader title="Datenschutzerklärung" size="lg" />
        </div>

        <div className="rounded-3xl bg-white p-7 sm:p-10 shadow-sheet space-y-8 text-claimondo-shield/90 leading-relaxed tracking-[-.005em]">
        {/* 1. Verantwortlicher */}
        <section>
          <h2 className="text-xl font-bold text-claimondo-navy tracking-[-.018em] mb-3">1. Verantwortlicher</h2>
          <p>
            Claimondo GmbH i.G.<br />
            Hansaring 10<br />
            50670 Köln<br />
            E-Mail: <a href="mailto:aaron.sprafke@claimondo.de" className="text-claimondo-ondo underline underline-offset-2 hover:text-claimondo-navy transition-colors">aaron.sprafke@claimondo.de</a>
          </p>
          <p className="mt-2">Geschäftsführer: Aaron Sprafke, Nicolas Kitta</p>
        </section>

        {/* 2. Welche Daten werden erhoben */}
        <section>
          <h2 className="text-xl font-bold text-claimondo-navy tracking-[-.018em] mb-3">2. Welche Daten werden erhoben</h2>
          <p>Im Rahmen der Nutzung unserer Plattform erheben und verarbeiten wir folgende personenbezogene Daten:</p>
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li><strong>Authentifizierungsdaten:</strong> E-Mail-Adresse, Passwort (gehasht), Login-Zeitpunkte</li>
            <li><strong>Profildaten:</strong> Vorname, Nachname, Anrede, Titel, Telefonnummer, Adresse</li>
            <li><strong>Falldaten:</strong> Schadensinformationen, Fahrzeugdaten, Unfallhergang, Dokumente, Fotos</li>
            <li><strong>Zahlungsdaten:</strong> Abrechnungsinformationen (Kreditkartendaten werden ausschließlich durch Stripe verarbeitet)</li>
            <li><strong>Kommunikationsdaten:</strong> E-Mail-Korrespondenz, SMS-Benachrichtigungen</li>
            <li><strong>Nutzungsdaten:</strong> Seitenaufrufe, Klickverhalten (anonymisiert)</li>
          </ul>
        </section>

        {/* 3. Zweck der Verarbeitung */}
        <section>
          <h2 className="text-xl font-bold text-claimondo-navy tracking-[-.018em] mb-3">3. Zweck der Verarbeitung</h2>
          <p>Die Verarbeitung Ihrer Daten erfolgt zu folgenden Zwecken:</p>
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li>Bereitstellung und Betrieb der Plattform für KFZ-Schadensmanagement</li>
            <li>Vermittlung zwischen Geschädigten, Sachverständigen und Kanzleien</li>
            <li>Abwicklung von Zahlungen und Abrechnungen</li>
            <li>Kommunikation per E-Mail und SMS im Rahmen der Fallbearbeitung</li>
            <li>Verbesserung unserer Dienste durch anonymisierte Nutzungsanalysen</li>
          </ul>
        </section>

        {/* 4. Rechtsgrundlage */}
        <section>
          <h2 className="text-xl font-bold text-claimondo-navy tracking-[-.018em] mb-3">4. Rechtsgrundlage</h2>
          <p>Die Verarbeitung Ihrer personenbezogenen Daten erfolgt auf Grundlage von:</p>
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li><strong>Art. 6 Abs. 1 lit. b DSGVO</strong> &mdash; Erfüllung eines Vertrages oder vorvertraglicher Maßnahmen (Nutzung der Plattform, Fallbearbeitung)</li>
            <li><strong>Art. 6 Abs. 1 lit. a DSGVO</strong> &mdash; Einwilligung (Cookies, Analytics, Marketing-Kommunikation)</li>
            <li><strong>Art. 6 Abs. 1 lit. f DSGVO</strong> &mdash; Berechtigtes Interesse (Fehlererkennung, Sicherheit, Plattform-Verbesserung)</li>
          </ul>
        </section>

        {/* 5. Auftragsverarbeiter */}
        <section>
          <h2 className="text-xl font-bold text-claimondo-navy tracking-[-.018em] mb-3">5. Auftragsverarbeiter</h2>
          <p>Wir setzen folgende Dienstleister als Auftragsverarbeiter ein:</p>
          <DataTableContainer variant="plain" className="mt-3">
            <Table className="border-collapse">
              <Thead className="!bg-transparent !text-inherit !text-sm !normal-case !tracking-normal">
                <Tr className="border-b border-claimondo-shield/20">
                  <Th className="!px-0 !pr-4 !py-2 !font-semibold text-left">Anbieter</Th>
                  <Th className="!px-0 !pr-4 !py-2 !font-semibold text-left">Sitz</Th>
                  <Th className="!px-0 !py-2 !font-semibold text-left">Zweck</Th>
                </Tr>
              </Thead>
              <Tbody className="!divide-[#1E3A5F]/10">
                <Tr>
                  <Td className="!px-0 !pr-4 !py-2 !text-inherit">Supabase Inc.</Td>
                  <Td className="!px-0 !pr-4 !py-2 !text-inherit">USA (Standard Contractual Clauses)</Td>
                  <Td className="!px-0 !py-2 !text-inherit">Datenbank, Authentifizierung, Dateispeicherung</Td>
                </Tr>
                <Tr>
                  <Td className="!px-0 !pr-4 !py-2 !text-inherit">Vercel Inc.</Td>
                  <Td className="!px-0 !pr-4 !py-2 !text-inherit">USA (SCC)</Td>
                  <Td className="!px-0 !py-2 !text-inherit">Hosting, CDN, Serverless Functions</Td>
                </Tr>
                <Tr>
                  <Td className="!px-0 !pr-4 !py-2 !text-inherit">Stripe Payments Europe Ltd.</Td>
                  <Td className="!px-0 !pr-4 !py-2 !text-inherit">Irland</Td>
                  <Td className="!px-0 !py-2 !text-inherit">Zahlungsabwicklung</Td>
                </Tr>
                <Tr>
                  <Td className="!px-0 !pr-4 !py-2 !text-inherit">Twilio Ireland Ltd.</Td>
                  <Td className="!px-0 !pr-4 !py-2 !text-inherit">Irland</Td>
                  <Td className="!px-0 !py-2 !text-inherit">SMS-Verifizierung</Td>
                </Tr>
                <Tr>
                  <Td className="!px-0 !pr-4 !py-2 !text-inherit">Google Ireland Ltd.</Td>
                  <Td className="!px-0 !pr-4 !py-2 !text-inherit">Irland</Td>
                  <Td className="!px-0 !py-2 !text-inherit">Maps, Calendar, OAuth, Vision API</Td>
                </Tr>
                <Tr>
                  <Td className="!px-0 !pr-4 !py-2 !text-inherit">Resend Inc.</Td>
                  <Td className="!px-0 !pr-4 !py-2 !text-inherit">USA (sobald aktiv)</Td>
                  <Td className="!px-0 !py-2 !text-inherit">E-Mail-Versand</Td>
                </Tr>
                <Tr>
                  <Td className="!px-0 !pr-4 !py-2 !text-inherit">Functional Software Inc. (Sentry)</Td>
                  <Td className="!px-0 !pr-4 !py-2 !text-inherit">USA (sobald aktiv)</Td>
                  <Td className="!px-0 !py-2 !text-inherit">Fehler-Monitoring, Performance-Tracking</Td>
                </Tr>
              </Tbody>
            </Table>
          </DataTableContainer>
        </section>

        {/* 6. Speicherdauer */}
        <section>
          <h2 className="text-xl font-bold text-claimondo-navy tracking-[-.018em] mb-3">6. Speicherdauer</h2>
          <p>
            Wir speichern Ihre personenbezogenen Daten nur so lange, wie es für die Erfüllung
            der Verarbeitungszwecke erforderlich ist oder gesetzliche Aufbewahrungsfristen bestehen.
            Falldaten werden nach Abschluss des Schadensfalles und Ablauf der gesetzlichen
            Aufbewahrungsfrist (in der Regel 10 Jahre gemäß HGB/AO) gelöscht.
            Kontodaten werden nach Kündigung und Ablauf etwaiger Aufbewahrungsfristen entfernt.
          </p>
        </section>

        {/* 7. Rechte des Betroffenen */}
        <section>
          <h2 className="text-xl font-bold text-claimondo-navy tracking-[-.018em] mb-3">7. Ihre Rechte</h2>
          <p>Sie haben gemäß DSGVO folgende Rechte:</p>
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li><strong>Auskunftsrecht</strong> (Art. 15 DSGVO) &mdash; Auskunft über Ihre gespeicherten Daten</li>
            <li><strong>Berichtigungsrecht</strong> (Art. 16 DSGVO) &mdash; Korrektur unrichtiger Daten</li>
            <li><strong>Löschungsrecht</strong> (Art. 17 DSGVO) &mdash; Löschung Ihrer Daten</li>
            <li><strong>Einschränkung</strong> (Art. 18 DSGVO) &mdash; Einschränkung der Verarbeitung</li>
            <li><strong>Datenübertragbarkeit</strong> (Art. 20 DSGVO) &mdash; Erhalt Ihrer Daten in maschinenlesbarem Format</li>
            <li><strong>Widerspruchsrecht</strong> (Art. 21 DSGVO) &mdash; Widerspruch gegen die Verarbeitung</li>
          </ul>
          <p className="mt-2">
            Zur Ausübung Ihrer Rechte wenden Sie sich bitte an:{' '}
            <a href="mailto:aaron.sprafke@claimondo.de" className="text-claimondo-ondo underline underline-offset-2 hover:text-claimondo-navy transition-colors">aaron.sprafke@claimondo.de</a>
          </p>
        </section>

        {/* 8. Beschwerderecht */}
        <section>
          <h2 className="text-xl font-bold text-claimondo-navy tracking-[-.018em] mb-3">8. Beschwerderecht</h2>
          <p>
            Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren.
            Die für uns zuständige Aufsichtsbehörde ist:
          </p>
          <p className="mt-2">
            Landesbeauftragte für Datenschutz und Informationsfreiheit Nordrhein-Westfalen<br />
            Postfach 20 04 44<br />
            40102 Düsseldorf<br />
            Telefon: 0211/38424-0<br />
            E-Mail: poststelle@ldi.nrw.de
          </p>
        </section>

        {/* Hinweis */}
        <div className="mt-8 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-5 py-3.5 text-sm text-amber-900">
          <strong>Hinweis:</strong> Diese Datenschutzerklärung ist ein Entwurf und wurde noch
          nicht von einem Anwalt geprüft.
        </div>
      </div>
      </div>
    </main>
  )
}
