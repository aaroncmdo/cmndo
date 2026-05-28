import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import PageHeader from '@/components/shared/PageHeader'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'
import { HQ_STREET, HQ_POSTAL_CODE, HQ_CITY, HQ_COUNTRY } from '@/lib/seo/brand-constants'

export const metadata: Metadata = {
  title: 'Datenschutzerklärung',
  description:
    'Datenschutzerklärung der Claimondo GmbH gemäß Art. 13 und 14 DSGVO — Verarbeitung personenbezogener Daten bei Lead-Anfrage, Schadenabwicklung und Webseitenbesuch.',
}

// Wiederverwendbare Link-Styles (Claimondo-Token, kein Inline-Hex).
const linkCls =
  'text-claimondo-ondo underline underline-offset-2 hover:text-claimondo-navy transition-colors'

// Section-Heading (h2) — konsistent mit dem bisherigen Seiten-Stil.
function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xl font-bold text-claimondo-navy tracking-[-.018em] mb-3">{children}</h2>
  )
}

// Sub-Section-Heading (h3) für die X.Y-Gliederung des Dokuments.
function H3({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-base font-semibold text-claimondo-navy mt-5 mb-2 tracking-[-.01em]">
      {children}
    </h3>
  )
}

// Daten-getriebene Tabelle über shared/DataTable (Komponenten-Set-Policy).
function LegalTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <DataTableContainer variant="plain" className="mt-3">
      <Table className="border-collapse">
        <Thead className="!bg-transparent !text-inherit !text-sm !normal-case !tracking-normal">
          <Tr className="border-b border-claimondo-shield/20">
            {head.map((h) => (
              <Th key={h} className="!px-0 !pr-4 !py-2 !font-semibold text-left align-top">
                {h}
              </Th>
            ))}
          </Tr>
        </Thead>
        <Tbody className="!divide-claimondo-shield/10">
          {rows.map((row, i) => (
            <Tr key={i}>
              {row.map((cell, j) => (
                <Td key={j} className="!px-0 !pr-4 !py-2 !text-inherit align-top">
                  {cell}
                </Td>
              ))}
            </Tr>
          ))}
        </Tbody>
      </Table>
    </DataTableContainer>
  )
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
        <div className="mb-2">
          <PageHeader title="Datenschutzerklärung" size="lg" />
        </div>
        <p className="text-sm text-claimondo-shield/70 mb-8">
          gemäß Art. 13 und 14 DSGVO · für Geschädigte, Webseitenbesucher und
          Lead-Formular-Nutzer · Stand: April 2026 · Version 2.0
        </p>

        <div className="rounded-3xl bg-white p-7 sm:p-10 shadow-sheet space-y-8 text-claimondo-shield/90 leading-relaxed tracking-[-.005em]">
          {/* Einleitung */}
          <section className="space-y-3">
            <p>
              Diese Datenschutzerklärung informiert Sie über die Verarbeitung personenbezogener
              Daten beim Besuch unserer Webseiten autounfall.io, autounfall.live und claimondo.de
              sowie der zugehörigen Landingpages und der Claimondo-App. Sie gilt unabhängig davon,
              ob Sie unser Lead-Formular ausfüllen, ein Beratungsgespräch beauftragen oder
              lediglich die Inhalte ansehen.
            </p>
            <p>
              Wir verarbeiten Ihre Daten ausschließlich auf Grundlage der gesetzlichen
              Bestimmungen (DSGVO, BDSG, TDDDG). Bei jeder Verarbeitung nennen wir Ihnen den
              konkreten Zweck, die Rechtsgrundlage und die Speicherdauer.
            </p>
          </section>

          {/* 1. Verantwortlicher */}
          <section>
            <H2>1. Verantwortlicher und Datenschutzkontakt</H2>
            <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 text-sm">
              <dt className="font-semibold text-claimondo-navy">Unternehmen</dt>
              <dd>Claimondo GmbH (in Gründung)</dd>
              <dt className="font-semibold text-claimondo-navy">Anschrift</dt>
              <dd>
                {HQ_STREET}, {HQ_POSTAL_CODE} {HQ_CITY}, {HQ_COUNTRY}
              </dd>
              <dt className="font-semibold text-claimondo-navy">Geschäftsführer</dt>
              <dd>Nicolas Kitta, Aaron Benjamin Sprafke</dd>
              <dt className="font-semibold text-claimondo-navy">Telefon</dt>
              <dd>0221 25906530</dd>
              <dt className="font-semibold text-claimondo-navy">E-Mail (Datenschutz)</dt>
              <dd>
                <a href="mailto:datenschutz@claimondo.de" className={linkCls}>
                  datenschutz@claimondo.de
                </a>
              </dd>
              <dt className="font-semibold text-claimondo-navy">E-Mail (allgemein)</dt>
              <dd>
                <a href="mailto:info@claimondo.de" className={linkCls}>
                  info@claimondo.de
                </a>
              </dd>
              <dt className="font-semibold text-claimondo-navy">Webpräsenzen</dt>
              <dd>autounfall.io · autounfall.live · claimondo.de</dd>
              <dt className="font-semibold text-claimondo-navy">Handelsregister</dt>
              <dd>[wird nach Eintragung ergänzt]</dd>
              <dt className="font-semibold text-claimondo-navy">USt-IdNr.</dt>
              <dd>[wird nach Erteilung ergänzt]</dd>
            </dl>
            <p className="mt-4">
              Datenschutzanfragen richten Sie bitte an{' '}
              <a href="mailto:datenschutz@claimondo.de" className={linkCls}>
                datenschutz@claimondo.de
              </a>
              . Wir antworten innerhalb der gesetzlichen Frist von einem Monat (Art. 12 Abs. 3
              DSGVO).
            </p>
            <p className="mt-2">
              Wir haben keinen externen Datenschutzbeauftragten benannt, da die gesetzlichen
              Voraussetzungen für eine Benennungspflicht (§ 38 BDSG) derzeit nicht erfüllt sind.
              Die Wahrnehmung der datenschutzrechtlichen Aufgaben erfolgt durch die
              Geschäftsführung.
            </p>
          </section>

          {/* 2. Allgemeine Hinweise */}
          <section>
            <H2>2. Allgemeine Hinweise zur Datenverarbeitung</H2>
            <H3>2.1 Umfang der Verarbeitung</H3>
            <p>
              Wir verarbeiten personenbezogene Daten unserer Nutzer grundsätzlich nur, soweit dies
              zur Bereitstellung einer funktionsfähigen Webseite, unserer Inhalte und Leistungen
              erforderlich ist. Die Verarbeitung erfolgt regelmäßig nach Einwilligung des Nutzers
              oder auf Grundlage einer gesetzlichen Erlaubnis.
            </p>
            <H3>2.2 Rechtsgrundlagen der Verarbeitung</H3>
            <div className="space-y-2">
              <p>
                Soweit wir für Verarbeitungsvorgänge personenbezogener Daten eine Einwilligung der
                betroffenen Person einholen, dient Art. 6 Abs. 1 lit. a DSGVO als Rechtsgrundlage.
              </p>
              <p>
                Bei der Verarbeitung zur Erfüllung eines Vertrages (z. B. Lead-Anfrage,
                Schadenabwicklung) dient Art. 6 Abs. 1 lit. b DSGVO als Rechtsgrundlage. Dies gilt
                auch für vorvertragliche Maßnahmen.
              </p>
              <p>
                Soweit eine Verarbeitung zur Erfüllung einer rechtlichen Verpflichtung erforderlich
                ist (z. B. Aufbewahrungspflichten nach HGB/AO), dient Art. 6 Abs. 1 lit. c DSGVO als
                Rechtsgrundlage.
              </p>
              <p>
                Ist die Verarbeitung zur Wahrung eines berechtigten Interesses unseres Unternehmens
                oder eines Dritten erforderlich und überwiegen die Interessen, Grundrechte und
                Grundfreiheiten der betroffenen Person das erstgenannte Interesse nicht, so dient
                Art. 6 Abs. 1 lit. f DSGVO als Rechtsgrundlage.
              </p>
            </div>
            <H3>2.3 Datenlöschung und Speicherdauer</H3>
            <p>
              Personenbezogene Daten werden gelöscht oder gesperrt, sobald der Zweck der Speicherung
              entfällt. Eine Speicherung kann darüber hinaus erfolgen, wenn dies durch europäische
              oder nationale Gesetzgebung vorgesehen wurde. Eine Sperrung oder Löschung erfolgt auch
              dann, wenn eine vorgeschriebene Speicherfrist abläuft, es sei denn, dass eine
              Erforderlichkeit zur weiteren Speicherung der Daten für einen Vertragsabschluss oder
              eine Vertragserfüllung besteht.
            </p>
          </section>

          {/* 3. Server-Logfiles */}
          <section>
            <H2>3. Bereitstellung der Webseite und Server-Logfiles</H2>
            <H3>3.1 Beschreibung und Umfang der Datenverarbeitung</H3>
            <p>
              Bei jedem Aufruf unserer Internetseite erfasst unser System automatisiert Daten und
              Informationen vom Computersystem des aufrufenden Rechners. Folgende Daten werden
              hierbei erhoben:
            </p>
            <ul className="mt-2 ml-1 space-y-1">
              <li>a) IP-Adresse des Nutzers (gekürzt nach 7 Tagen);</li>
              <li>b) Datum und Uhrzeit des Zugriffs;</li>
              <li>c) aufgerufene URL und HTTP-Statuscode;</li>
              <li>d) übertragene Datenmenge;</li>
              <li>e) Webseite, von der die Anforderung kommt (Referrer);</li>
              <li>f) Browser-Typ und -Version;</li>
              <li>g) verwendetes Betriebssystem;</li>
              <li>h) Spracheinstellung des Browsers.</li>
            </ul>
            <p className="mt-3">
              Die Daten werden in den Logfiles unseres Hostingproviders IONOS SE gespeichert. Eine
              Speicherung dieser Daten zusammen mit anderen personenbezogenen Daten des Nutzers
              findet nicht statt.
            </p>
            <H3>3.2 Rechtsgrundlage und Zweck</H3>
            <p>
              Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse). Unser
              berechtigtes Interesse besteht in der Sicherstellung des Webseitenbetriebs, der
              IT-Sicherheit, der Abwehr von Angriffen und der Optimierung unserer Inhalte. In keinem
              Fall verwenden wir die erhobenen Daten zu dem Zweck, Rückschlüsse auf Ihre Person zu
              ziehen.
            </p>
            <H3>3.3 Speicherdauer</H3>
            <p>
              Die Logfiles werden nach 7 Tagen automatisch gelöscht. IP-Adressen werden bereits nach
              7 Tagen gekürzt (Anonymisierung).
            </p>
          </section>

          {/* 4. Cookies und Tracking */}
          <section>
            <H2>4. Cookies und Tracking-Technologien</H2>
            <H3>4.1 Was sind Cookies?</H3>
            <p>
              Cookies sind kleine Textdateien, die beim Besuch einer Webseite auf Ihrem Endgerät
              gespeichert werden. Sie ermöglichen es uns, Ihren Browser beim nächsten Besuch
              wiederzuerkennen oder bestimmte Funktionen unserer Webseite bereitzustellen. Wir
              unterscheiden zwischen technisch notwendigen Cookies und Cookies, die einer
              Einwilligung bedürfen.
            </p>
            <H3>4.2 Technisch notwendige Cookies (ohne Einwilligung)</H3>
            <p>
              Wir setzen folgende technisch notwendige Cookies ein, die für den Betrieb unserer
              Webseite zwingend erforderlich sind. Rechtsgrundlage ist § 25 Abs. 2 Nr. 2 TDDDG in
              Verbindung mit Art. 6 Abs. 1 lit. f DSGVO:
            </p>
            <LegalTable
              head={['Cookie-Name', 'Zweck', 'Speicherdauer', 'Anbieter']}
              rows={[
                ['PHPSESSID / sessionId', 'Sitzungsverwaltung, Formular-Status', 'Session', 'Claimondo'],
                ['borlabs-cookie', 'Speichert Ihre Cookie-Einstellungen', '12 Monate', 'Borlabs'],
                ['csrf_token', 'Schutz vor Cross-Site-Request-Forgery-Angriffen', 'Session', 'Claimondo'],
                ['XSRF-TOKEN', 'Sicherheits-Token für API-Aufrufe', 'Session', 'Claimondo'],
              ]}
            />
            <H3>4.3 Einwilligungspflichtige Cookies (Cookie-Banner)</H3>
            <p>
              Beim ersten Besuch unserer Webseite blenden wir ein Cookie-Consent-Banner ein, in dem
              Sie über die einwilligungspflichtigen Cookies informiert werden und Ihre Einwilligung
              erteilen oder verweigern können (Art. 6 Abs. 1 lit. a DSGVO i. V. m. § 25 Abs. 1
              TDDDG). Sie können Ihre Einwilligung jederzeit für die Zukunft widerrufen, indem Sie
              die Cookie-Einstellungen über den Link „Cookie-Einstellungen“ im Footer unserer
              Webseite öffnen.
            </p>
            <p className="mt-2">
              Folgende Cookies und Tracking-Mechanismen setzen wir nur nach Ihrer ausdrücklichen
              Einwilligung ein:
            </p>
            <LegalTable
              head={['Cookie / Dienst', 'Zweck', 'Speicherdauer', 'Anbieter']}
              rows={[
                ['_gcl_au', 'Google Ads Conversion-Tracking', '90 Tage', 'Google Ireland Ltd.'],
                ['_ga, _ga_*', 'Google Analytics 4 (anonymisiert)', '13 Monate', 'Google Ireland Ltd.'],
                ['_fbp', 'Meta Pixel (Conversion-Tracking)', '90 Tage', 'Meta Platforms Ireland Ltd.'],
                ['Google Maps Embed', 'Standortanzeige Gutachter / Kanzlei', 'Session', 'Google Ireland Ltd.'],
                ['YouTube Embed (no-cookie)', 'Erklärvideos auf Landingpages', 'Session', 'Google Ireland Ltd.'],
              ]}
            />
            <p className="mt-3 text-sm text-claimondo-shield/70">
              Hinweis: Wir setzen den erweiterten Datenschutzmodus von YouTube
              (youtube-nocookie.com) ein. Cookies werden erst beim Klick auf das Video gesetzt.
            </p>
          </section>

          {/* 5. Lead-Formular */}
          <section>
            <H2>5. Lead-Formular und Beratungsanfrage</H2>
            <H3>5.1 Beschreibung der Datenverarbeitung</H3>
            <p>
              Auf unseren Landingpages bieten wir Ihnen die Möglichkeit, über ein Lead-Formular eine
              kostenlose Beratungsanfrage zu stellen. Dabei werden folgende Daten erhoben:
            </p>
            <ul className="mt-2 ml-1 space-y-1">
              <li>
                <span className="font-semibold text-claimondo-navy">Pflichtfelder:</span> Vorname,
                Nachname, Telefonnummer oder E-Mail-Adresse, Unfalldatum, PLZ des Unfallorts,
                Schuldfrage („unverschuldet“ / „unklar“);
              </li>
              <li>
                <span className="font-semibold text-claimondo-navy">Optionale Felder:</span>{' '}
                Fahrzeugtyp, Schadenbeschreibung, Foto-Upload (Unfallbilder).
              </li>
            </ul>
            <p className="mt-3">
              Daneben werden technische Daten erhoben (siehe Ziff. 3) sowie der Zeitstempel der
              Übermittlung und die IP-Adresse zur Missbrauchsprävention (gespeichert für 30 Tage).
            </p>
            <H3>5.2 Zweck der Verarbeitung</H3>
            <p>
              Die Daten werden zum Zweck der Bearbeitung Ihrer Anfrage verarbeitet. Konkret nehmen
              wir telefonisch oder per WhatsApp Kontakt mit Ihnen auf, prüfen ob wir Ihren
              Schadenfall betreuen können, und leiten gegebenenfalls den weiteren Prozess
              (Sicherungsabtretung, Anwaltsvollmacht, Gutachterzuweisung) ein.
            </p>
            <H3>5.3 Rechtsgrundlage</H3>
            <p>
              Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Durchführung vorvertraglicher
              Maßnahmen auf Anfrage der betroffenen Person). Mit dem Absenden des Formulars erteilen
              Sie uns zudem ausdrücklich Ihr Einverständnis, dass wir Sie auf den von Ihnen
              angegebenen Kontaktwegen kontaktieren dürfen (Art. 6 Abs. 1 lit. a DSGVO).
            </p>
            <H3>5.4 Speicherdauer</H3>
            <p>
              Sofern Ihre Anfrage zu einem Vertragsabschluss führt, werden die Daten in unsere
              Schadenakte übernommen und gemäß Ziffer 9 dieser Datenschutzerklärung gespeichert.
              Kommt kein Vertragsabschluss zustande, löschen wir die Daten innerhalb von 6 Monaten
              nach letztem Kontakt, sofern keine gesetzlichen Aufbewahrungspflichten bestehen.
            </p>
            <H3>5.5 Widerruf und Widerspruch</H3>
            <p>
              Sie können der Verarbeitung Ihrer Daten jederzeit widersprechen, indem Sie eine E-Mail
              an{' '}
              <a href="mailto:datenschutz@claimondo.de" className={linkCls}>
                datenschutz@claimondo.de
              </a>{' '}
              senden. Wir werden Ihre Daten dann unverzüglich löschen, sofern keine gesetzlichen
              Aufbewahrungspflichten entgegenstehen.
            </p>
          </section>

          {/* 6. Schadenbearbeitung */}
          <section>
            <H2>6. Schadenbearbeitung und Vertragsdurchführung</H2>
            <H3>6.1 Welche Daten wir verarbeiten</H3>
            <p>
              Sobald Sie uns mit der Schadenabwicklung beauftragen (durch Unterzeichnung der
              Sicherungsabtretung gem. § 398 BGB und der Vollmacht gem. § 164 BGB), verarbeiten wir
              folgende Datenkategorien:
            </p>
            <ul className="mt-2 ml-1 space-y-1">
              <li>a) Identifikationsdaten: Name, Vorname, Geburtsdatum, Anschrift, Geburtsort;</li>
              <li>b) Kontaktdaten: Telefonnummer, E-Mail-Adresse, WhatsApp-Nummer;</li>
              <li>
                c) Fahrzeugdaten: Kennzeichen, Fahrzeugtyp, Fahrzeug-Identifikationsnummer (FIN),
                Erstzulassung, Kilometerstand, Halterdaten;
              </li>
              <li>
                d) Unfalldaten: Unfalldatum, Unfallort, Unfallhergang, Schuldfrage, beteiligte
                Parteien, Polizei-Aktenzeichen;
              </li>
              <li>
                e) Versicherungsdaten: Name und Anschrift des gegnerischen Versicherers,
                Schadennummer, Kennzeichen des Unfallgegners;
              </li>
              <li>
                f) Dokumente: Führerschein, Fahrzeugschein, Unfallbilder, Schadenprotokoll,
                ärztliche Atteste (bei Personenschaden);
              </li>
              <li>g) Bankdaten: IBAN und Kontoinhaber für die Schadensregulierung;</li>
              <li>
                h) Vertragsunterlagen: Sicherungsabtretung, Unterschriftsvollmacht, Anwaltsvollmacht
                (digital signiert);
              </li>
              <li>
                i) Kommunikationsdaten: Inhalte der Kommunikation per WhatsApp, E-Mail, Telefon und
                Portal.
              </li>
            </ul>
            <H3>6.2 Zweck und Rechtsgrundlage</H3>
            <LegalTable
              head={['Zweck', 'Rechtsgrundlage', 'Speicherdauer']}
              rows={[
                ['Schadenbearbeitung und Koordination Sachverständiger', 'Art. 6 Abs. 1 lit. b DSGVO (Vertrag)', 'Bis Abschluss + 3 Jahre (Verjährung)'],
                ['Weiterleitung an Partnerkanzlei zur Rechtsdurchsetzung', 'Art. 6 Abs. 1 lit. b DSGVO', 'Bis Abschluss + 3 Jahre'],
                ['FIN-Abfrage zur Fahrzeugidentifikation', 'Art. 6 Abs. 1 lit. b DSGVO', 'Bis Abschluss + 3 Jahre'],
                ['KI-Schadenvorabkalkulation (DAT)', 'Art. 6 Abs. 1 lit. b DSGVO', 'Bis Abschluss + 3 Jahre'],
                ['Statusnachrichten per WhatsApp / E-Mail / Telefon', 'Art. 6 Abs. 1 lit. b DSGVO', 'Bis Abschluss + 3 Jahre'],
                ['Buchführung und Steuerrecht', 'Art. 6 Abs. 1 lit. c DSGVO (§ 147 AO)', '10 Jahre'],
                ['Geltendmachung, Ausübung oder Verteidigung von Rechtsansprüchen', 'Art. 6 Abs. 1 lit. f DSGVO', 'Bis zur Verjährung'],
              ]}
            />
          </section>

          {/* 7. Auftragsverarbeiter */}
          <section>
            <H2>7. Auftragsverarbeiter und Empfänger Ihrer Daten</H2>
            <H3>7.1 Empfänger im Rahmen der Schadenabwicklung</H3>
            <p>Ihre Daten werden im Rahmen der Schadenabwicklung an folgende Empfänger weitergegeben:</p>
            <ul className="mt-2 ml-1 space-y-1">
              <li>
                a) Kfz-Sachverständiger — zur Begutachtung des Fahrzeugschadens (Name, Kontaktdaten,
                Fahrzeugdaten, Termindetails);
              </li>
              <li>
                b) Partnerkanzlei LexDrive UG / RA Kevin Genter — zur außergerichtlichen und ggf.
                gerichtlichen Durchsetzung Ihres Schadensersatzanspruchs (vollständige Falldaten);
              </li>
              <li>
                c) DAT Deutsche Automobil Treuhand GmbH — zur KI-Schadenvorabkalkulation
                (ausschließlich Fahrzeug- und Schadenparameter);
              </li>
              <li>d) carVertical (UAB) — zur Fahrzeughistorienprüfung anhand der FIN;</li>
              <li>
                e) DSR24 / KfzVS — nur bei Inanspruchnahme von Honorar-Factoring durch den
                Sachverständigen;
              </li>
              <li>
                f) Gegnerische Kfz-Haftpflichtversicherung — über die Partnerkanzlei im Rahmen der
                Schadensregulierung.
              </li>
            </ul>
            <H3>7.2 Auftragsverarbeiter gemäß Art. 28 DSGVO</H3>
            <p>
              Wir setzen folgende Dienstleister ein, die personenbezogene Daten in unserem Auftrag
              verarbeiten. Mit allen Auftragsverarbeitern bestehen Verträge gemäß Art. 28 DSGVO.
              Soweit Daten in Drittländer übermittelt werden, geschieht dies auf Grundlage von
              Standardvertragsklauseln (SCCs) oder eines Angemessenheitsbeschlusses der
              EU-Kommission.
            </p>
            <LegalTable
              head={['Dienstleister', 'Zweck', 'Standort', 'Grundlage']}
              rows={[
                ['IONOS SE, Montabaur', 'Webhosting (dedizierter VPS)', 'Deutschland', 'AVV'],
                ['Twilio Inc., USA', 'WhatsApp Business API (technischer Provider)', 'USA', 'AVV + DPF'],
                ['Meta Platforms Ireland', 'WhatsApp Business API (Messaging-Plattform)', 'EU/USA', 'AVV + SCCs'],
                ['Google Ireland Ltd.', 'Google Ads, Maps, Analytics, Fonts', 'EU/USA', 'AVV + SCCs'],
                ['PixelCreators (M. Pramor)', 'Google Ads Management, Conversion-Tracking', 'Deutschland', 'AVV'],
                ['HERE Technologies', 'Geolokation, Isoline-API (Dispatch)', 'EU', 'AVV'],
                ['DAT Deutsche Automobil Treuhand', 'Fahrzeugbewertung, KI-Vorabkalkulation', 'Deutschland', 'AVV'],
                ['carVertical UAB', 'Fahrzeughistorienprüfung (FIN)', 'EU (LT)', 'AVV'],
                ['Salesforce.com EMEA', 'CRM und Fallverwaltung', 'EU', 'AVV + SCCs'],
                ['Supabase Inc.', 'Datenbank-Backend, Datei- und Dokumentenspeicher', 'EU (Frankfurt)', 'AVV'],
                ['Railway Corp.', 'Application Hosting', 'EU', 'AVV'],
                ['Aircall SAS, Paris', 'Cloud-Telefonie, Anrufaufzeichnung, KI-Transkription', 'FR/USA', 'AVV + SCCs'],
                ['matelso GmbH, Stuttgart', 'Call Tracking (dynamische Rufnummern)', 'Deutschland', 'AVV'],
              ]}
            />
            <p className="mt-3">
              Die digitale Signatur der Vertragsunterlagen (Sicherungsabtretung, Vollmachten)
              erfolgt direkt in unserer Plattform. Ein externer Signaturdienstleister wird hierfür
              nicht eingesetzt; die signierten Dokumente werden in unserem Dokumentenspeicher
              (Supabase, EU/Frankfurt) abgelegt.
            </p>
            <p className="mt-3 text-sm text-claimondo-shield/70">
              Hinweis: Im Rahmen der Weiterentwicklung der Plattform können zukünftig weitere
              Auftragsverarbeiter hinzukommen, insbesondere für KI-gestützte Dienste,
              Monitoring/Fehlerverfolgung, Push-Benachrichtigungen und Zahlungsdienstleister. Diese
              Datenschutzerklärung wird entsprechend aktualisiert; die jeweils aktuelle Version
              finden Sie auf claimondo.de/datenschutz.
            </p>
          </section>

          {/* 8. Drittlandübermittlung */}
          <section>
            <H2>8. Drittlandübermittlung</H2>
            <p>
              Eine Übermittlung Ihrer Daten in Länder außerhalb der EU/des EWR (Drittländer) findet
              derzeit an folgende Anbieter in den USA statt: Twilio, Google, Meta sowie
              über Aircall an Amazon Web Services (AWS, USA) und Microsoft Corporation (USA) als
              Sub-Auftragsverarbeiter. Diese Anbieter sind nach dem EU-US Data Privacy Framework
              zertifiziert oder wir haben mit ihnen Standardvertragsklauseln (SCCs) gemäß Art. 46
              Abs. 2 lit. c DSGVO abgeschlossen.
            </p>
            <p className="mt-2">
              Trotz dieser Maßnahmen kann ein Restrisiko bestehen, dass US-Behörden auf Ihre Daten
              zugreifen. Über dieses Risiko informieren wir Sie hiermit ausdrücklich. Eine
              Übermittlung erfolgt nur, wenn Sie über das Cookie-Banner oder durch die Nutzung
              unserer Dienste eingewilligt haben.
            </p>
          </section>

          {/* 9. Drittinhalte */}
          <section>
            <H2>9. Drittinhalte und Einbindungen auf der Webseite</H2>
            <H3>9.1 Google Fonts (lokal eingebunden)</H3>
            <p>
              Wir verwenden auf unseren Webseiten Google Fonts zur einheitlichen Darstellung von
              Schriftarten. Die Schriftarten sind lokal auf unserem Server installiert
              (self-hosted). Eine Verbindung zu Google-Servern findet beim Besuch unserer Seiten
              nicht statt. Es werden keine Cookies gesetzt und keine IP-Adressen an Google
              übermittelt.
            </p>
            <H3>9.2 Google Maps</H3>
            <p>
              Wir nutzen auf unserer Webseite den Kartendienst Google Maps der Google Ireland Ltd.,
              Gordon House, Barrow Street, Dublin 4, Irland. Beim Aufruf einer Seite mit
              Google-Maps-Einbindung werden Daten an Google in den USA übertragen, insbesondere Ihre
              IP-Adresse, Datum und Uhrzeit der Anfrage, Standort, Inhalt der Anfrage.
            </p>
            <p className="mt-2">
              Wir setzen Google Maps nur ein, wenn Sie zuvor über das Cookie-Banner Ihre
              Einwilligung erteilt haben (Art. 6 Abs. 1 lit. a DSGVO). Weitere Informationen finden
              Sie in den Datenschutzhinweisen von Google unter{' '}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className={linkCls}>
                policies.google.com/privacy
              </a>
              .
            </p>
            <H3>9.3 YouTube</H3>
            <p>
              Wir binden auf unseren Landingpages teilweise Erklärvideos der Plattform YouTube
              (Google Ireland Ltd.) im erweiterten Datenschutzmodus ein (youtube-nocookie.com).
              YouTube setzt erst dann Cookies, wenn Sie aktiv auf das Video klicken. Bis zu diesem
              Zeitpunkt werden keine personenbezogenen Daten an YouTube übermittelt.
            </p>
            <H3>9.4 Borlabs Cookie (Cookie-Consent-Tool)</H3>
            <p>
              Wir nutzen das Cookie-Consent-Tool Borlabs Cookie der Borlabs GmbH, Rübenkamp 32,
              22305 Hamburg, um die Einwilligungen unserer Nutzer zur Verwendung von Cookies
              einzuholen, zu protokollieren und zu verwalten. Die Daten werden lokal in Ihrem
              Browser gespeichert (LocalStorage). Es findet keine Übertragung an Borlabs oder Dritte
              statt. Rechtsgrundlage ist Art. 6 Abs. 1 lit. c DSGVO (Erfüllung der Nachweispflicht
              aus Art. 7 Abs. 1 DSGVO).
            </p>
          </section>

          {/* 10. Online-Marketing */}
          <section>
            <H2>10. Online-Marketing und Conversion-Tracking</H2>
            <H3>10.1 Google Ads (Google AdWords)</H3>
            <div className="space-y-2">
              <p>
                Wir nutzen den Online-Werbedienst Google Ads, um auf externen Webseiten auf unsere
                attraktiven Angebote aufmerksam zu machen. Wir können in Bezug auf die Daten der
                Werbekampagnen ermitteln, wie erfolgreich die einzelnen Werbemaßnahmen sind. Wir
                verfolgen damit das Interesse, Ihnen Werbung anzuzeigen, die für Sie von Interesse
                ist, unsere Webseite für Sie interessanter zu gestalten und eine faire Berechnung
                von Werbekosten zu erreichen.
              </p>
              <p>
                Diese Werbemittel werden durch Google über sogenannte „Ad Server“ ausgeliefert. Dazu
                nutzen wir Ad-Server-Cookies, durch die bestimmte Parameter zur Erfolgsmessung
                gemessen werden können (Einblendung von Anzeigen, Klicks durch Nutzer).
              </p>
              <p>
                Sofern Sie über eine Google-Anzeige auf unsere Webseite gelangen, wird von Google
                Ads ein Cookie auf Ihrem PC gespeichert. Diese Cookies verlieren in der Regel nach
                30 Tagen ihre Gültigkeit und sollen nicht zur persönlichen Identifizierung dienen.
              </p>
              <p>Rechtsgrundlage ist Art. 6 Abs. 1 lit. a DSGVO (Einwilligung über das Cookie-Banner).</p>
            </div>
            <H3>10.2 Google Ads Conversion-Tracking</H3>
            <p>
              Wir nutzen Google Ads Conversion-Tracking, um die Wirksamkeit unserer Werbeanzeigen zu
              messen. Wenn Sie auf eine von Google geschaltete Anzeige klicken, wird auf Ihrem
              Computer ein Cookie für das Conversion-Tracking gesetzt. Diese Cookies haben eine
              begrenzte Gültigkeit und werden nicht zur persönlichen Identifikation verwendet.
              Besuchen Sie bestimmte Seiten unserer Webseite und das Cookie ist noch nicht
              abgelaufen, können Google und wir erkennen, dass Sie auf die Anzeige geklickt haben und
              zu dieser Seite weitergeleitet wurden.
            </p>
            <H3>10.3 Google Analytics 4 (anonymisiert)</H3>
            <div className="space-y-2">
              <p>
                Wir nutzen Google Analytics 4 (GA4) zur Webseitenanalyse. GA4 verwendet Cookies, die
                eine Analyse der Benutzung der Webseite durch Sie ermöglichen. Wir haben die
                IP-Anonymisierung aktiviert, sodass Ihre IP-Adresse von Google innerhalb der EU/des
                EWR vor der Übermittlung in die USA gekürzt wird. Eine Zuordnung zu Ihrer Person ist
                damit ausgeschlossen.
              </p>
              <p>
                Rechtsgrundlage ist Art. 6 Abs. 1 lit. a DSGVO. Sie können die Verarbeitung jederzeit
                widerrufen über die Cookie-Einstellungen oder durch Installation des
                Browser-Add-ons unter{' '}
                <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer" className={linkCls}>
                  tools.google.com/dlpage/gaoptout
                </a>
                .
              </p>
            </div>
            <H3>10.4 Meta Pixel (Facebook Pixel)</H3>
            <div className="space-y-2">
              <p>
                Sofern wir Werbung über Meta-Plattformen (Facebook, Instagram) schalten, setzen wir
                das Meta Pixel ein, um die Wirksamkeit dieser Werbung zu messen. Das Pixel speichert
                ein Cookie und erfasst, ob Sie nach dem Klick auf eine Meta-Anzeige unsere Webseite
                besucht und eine bestimmte Aktion durchgeführt haben (z. B. Lead-Formular
                ausgefüllt).
              </p>
              <p>
                Anbieter ist Meta Platforms Ireland Ltd., 4 Grand Canal Square, Dublin 2, Irland.
                Datenübermittlung in die USA auf Basis SCCs. Rechtsgrundlage ist Art. 6 Abs. 1 lit.
                a DSGVO (Einwilligung über das Cookie-Banner).
              </p>
            </div>
            <H3>10.5 Matelso Call Tracking</H3>
            <div className="space-y-2">
              <p>
                Wir nutzen den Call-Tracking-Dienst Matelso der matelso GmbH, Heilbronner Straße
                150, 70191 Stuttgart, Deutschland. Matelso ermöglicht es uns zu erkennen, über
                welchen Marketingkanal (z. B. Google Ads, organische Suche, Direkteinstieg) Sie auf
                unsere Webseite gelangt sind und uns telefonisch kontaktieren.
              </p>
              <p>
                <span className="font-semibold text-claimondo-navy">Funktionsweise:</span> Beim
                Besuch unserer Webseite wird Ihnen je nach Besucherquelle eine dynamisch zugewiesene
                Telefonnummer angezeigt. Wenn Sie diese Nummer anrufen, leitet Matelso den Anruf an
                unsere zentrale Rufnummer weiter und erfasst dabei Datum, Uhrzeit, Dauer und die
                anrufende Telefonnummer.
              </p>
              <p>
                <span className="font-semibold text-claimondo-navy">Übermittlung an unser CRM:</span>{' '}
                Damit wir Ihr telefonisches Anliegen bearbeiten und Sie zurückrufen können,
                übermittelt Matelso die genannten Anrufdaten unmittelbar nach dem Anruf
                automatisiert an unser eigenes Kundenmanagement-System (CRM). Dort legen wir anhand
                Ihrer Rufnummer einen Kontakt (Lead) an bzw. ordnen den Anruf einem bereits
                vorhandenen Kontakt zu, um Ihre Anfrage weiterzubearbeiten. Eine darüber
                hinausgehende Verknüpfung mit weiteren personenbezogenen Daten (z. B. Schaden- oder
                Fahrzeugdaten) erfolgt erst, wenn Sie uns mit der Schadenabwicklung beauftragen.
              </p>
              <p>
                <span className="font-semibold text-claimondo-navy">Verarbeitete Daten:</span>{' '}
                Anrufende Rufnummer (vollständig), angerufene (dynamische) Rufnummer, Datum und
                Uhrzeit des Anrufs, Anrufdauer, Anrufstatus, Marketingkanal/Quelle des Anrufs,
                Session-ID des Webseitenbesuchs, IP-Adresse (gekürzt).
              </p>
              <p>
                <span className="font-semibold text-claimondo-navy">Rechtsgrundlagen:</span> Die
                Anzeige der dynamischen Rufnummer und die Zuordnung zum Marketingkanal erfolgen auf
                Grundlage Ihrer Einwilligung (Art. 6 Abs. 1 lit. a DSGVO i. V. m. § 25 Abs. 1 TDDDG,
                Cookie-Kategorie „Marketing“). Die anschließende Anlage eines Kontakts in unserem CRM
                und die Kontaktaufnahme zu Ihnen erfolgen zur Durchführung vorvertraglicher Maßnahmen
                auf Ihre Anfrage hin (Art. 6 Abs. 1 lit. b DSGVO). Ohne Ihre Marketing-Einwilligung
                wird Ihnen unsere statische Hauptrufnummer angezeigt und es findet keine Zuordnung zu
                Marketingkanälen statt.
              </p>
              <p>
                <span className="font-semibold text-claimondo-navy">Speicherdauer:</span> Die
                Anrufdaten werden bei Matelso für 12 Monate gespeichert und anschließend automatisch
                gelöscht. Die in unser CRM übernommenen Kontaktdaten werden gemäß Ziffer 5.4 dieser
                Datenschutzerklärung gelöscht, sofern kein Vertragsabschluss zustande kommt. Mit
                Matelso besteht ein Auftragsverarbeitungsvertrag gemäß Art. 28 DSGVO. Server-Standort
                ist Deutschland; eine Drittlandsverarbeitung findet nicht statt.
              </p>
              <p>
                Weitere Informationen finden Sie in der Datenschutzerklärung von Matelso unter{' '}
                <a href="https://www.matelso.com/datenschutz" target="_blank" rel="noopener noreferrer" className={linkCls}>
                  matelso.com/datenschutz
                </a>
                .
              </p>
            </div>
          </section>

          {/* 11. WhatsApp */}
          <section>
            <H2>11. Kommunikation per WhatsApp Business</H2>
            <p>
              Wir bieten Ihnen die Kommunikation über WhatsApp Business an. Anbieter ist Meta
              Platforms Ireland Ltd., 4 Grand Canal Square, Dublin 2, Irland. Die technische
              Bereitstellung der WhatsApp Business API erfolgt über die Twilio Inc., 375 Beale
              Street, San Francisco, USA.
            </p>
            <p className="mt-2">
              Wenn Sie uns über WhatsApp kontaktieren, werden personenbezogene Daten (Telefonnummer,
              Profilname, Nachrichteninhalt, Zeitstempel) an Meta und Twilio übermittelt. Meta
              verarbeitet diese Daten in den USA. Mit beiden Anbietern haben wir
              Auftragsverarbeitungsverträge geschlossen; die Übermittlung in die USA erfolgt auf
              Basis Standardvertragsklauseln und der Zertifizierung nach dem EU-US Data Privacy
              Framework.
            </p>
            <p className="mt-2">
              Wir nutzen WhatsApp ausschließlich für die fallbezogene Kommunikation
              (Statusnachrichten, Dokumentenanforderung, Terminbestätigungen). Rechtsgrundlage ist
              Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung). Eine Nutzung zu Marketingzwecken
              erfolgt nur mit Ihrer ausdrücklichen Einwilligung.
            </p>
            <p className="mt-3 text-sm text-claimondo-shield/70">
              Hinweis: Bitte beachten Sie, dass WhatsApp auf Ihre Kontaktliste zugreift. Wir
              empfehlen Ihnen, sich vor der Kontaktaufnahme über die Datenschutzpraktiken von
              WhatsApp zu informieren:{' '}
              <a href="https://www.whatsapp.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className={linkCls}>
                whatsapp.com/legal/privacy-policy
              </a>
              .
            </p>
          </section>

          {/* 12. Aircall */}
          <section>
            <H2>12. Telefonkommunikation und Anrufaufzeichnung (Aircall)</H2>
            <H3>12.1 Beschreibung des Dienstes</H3>
            <p>
              Für unsere Telefonkommunikation nutzen wir den cloudbasierten Telefonie-Dienst Aircall
              der Aircall SAS, 11-15 rue Saint-Georges, 75009 Paris, Frankreich. Aircall stellt uns
              die technische Infrastruktur für ein- und ausgehende Telefonate, die Anrufaufzeichnung
              sowie die KI-gestützte Transkription und Auswertung von Telefongesprächen zur
              Verfügung.
            </p>
            <H3>12.2 Verarbeitete Daten</H3>
            <ul className="mt-2 ml-1 space-y-1">
              <li>a) Telefonnummer (Anrufer und Angerufener);</li>
              <li>b) Datum, Uhrzeit und Dauer des Anrufs;</li>
              <li>c) Audioaufzeichnung des Telefongesprächs (nur bei vorheriger ausdrücklicher Einwilligung);</li>
              <li>d) KI-generierte Transkription des Gesprächs (nur bei aufgezeichneten Anrufen);</li>
              <li>e) KI-generierte Zusammenfassungen, Schlüsselthemen und Sentiment-Analysen aus den Transkripten;</li>
              <li>f) Notizen, Tags und Markierungen unserer Mitarbeiter zum Gespräch.</li>
            </ul>
            <H3>12.3 Zweck der Verarbeitung</H3>
            <p>
              Wir verarbeiten Ihre Telefonkommunikation zu folgenden Zwecken: Bearbeitung Ihrer
              Anfrage und Schadenabwicklung; Qualitätssicherung und Schulung unserer Mitarbeiter;
              Dokumentation der mit Ihnen getroffenen Vereinbarungen; Optimierung unserer
              Beratungsprozesse durch KI-gestützte Auswertung der Gesprächsinhalte (z. B. Erkennung
              typischer Fragen, Zusammenfassung der wichtigsten Punkte).
            </p>
            <H3>12.4 Rechtsgrundlage und ausdrückliche Einwilligung</H3>
            <div className="space-y-2">
              <p>
                Für das reine Telefongespräch ohne Aufzeichnung ist die Rechtsgrundlage Art. 6 Abs.
                1 lit. b DSGVO (Vertragserfüllung bzw. vorvertragliche Maßnahmen).
              </p>
              <p>
                Für die Aufzeichnung und Transkription des Gesprächs benötigen wir Ihre
                ausdrückliche Einwilligung gemäß Art. 6 Abs. 1 lit. a DSGVO.
              </p>
              <p>
                Zu Beginn jedes Telefonats werden Sie durch eine Ansage darüber informiert, dass das
                Gespräch aufgezeichnet und transkribiert wird, und um Ihre Einwilligung gebeten. Sie
                können die Aufzeichnung jederzeit verweigern; das Gespräch wird dann ohne
                Aufzeichnung fortgeführt. Eine Verweigerung hat keine Nachteile für Sie zur Folge.
              </p>
              <p>
                Die Einwilligung ist freiwillig und kann jederzeit für die Zukunft widerrufen
                werden, indem Sie eine E-Mail an{' '}
                <a href="mailto:datenschutz@claimondo.de" className={linkCls}>
                  datenschutz@claimondo.de
                </a>{' '}
                senden. Auf Ihren Wunsch werden bereits bestehende Aufzeichnungen und Transkripte
                unverzüglich gelöscht.
              </p>
            </div>
            <H3>12.5 Drittlandsverarbeitung und Sub-Auftragsverarbeiter</H3>
            <p>
              Aircall hat seinen Hauptsitz in Frankreich (EU). Bitte beachten Sie jedoch folgende
              Drittlandübermittlungen, die mit der Nutzung von Aircall verbunden sind:
            </p>
            <ul className="mt-2 ml-1 space-y-1">
              <li>
                a) Audioaufzeichnungen und Transkripte werden derzeit ausschließlich auf
                AWS-Servern in Oregon, USA gespeichert. Aircall arbeitet an einer Migration zu
                EU-Servern.
              </li>
              <li>
                b) Für die KI-gestützten Zusatzfunktionen (Call Summarization, Schlüsselthemen,
                Sentiment-Analyse) wird Microsoft Corporation, USA als Sub-Auftragsverarbeiter
                eingesetzt. Microsoft verarbeitet die Transkripte ausschließlich zur Erstellung der
                KI-Insights und löscht die Daten unmittelbar nach der Verarbeitung. Die Transkripte
                werden nicht zum Training der KI-Modelle verwendet.
              </li>
            </ul>
            <p className="mt-3">
              Diese Drittlandübermittlungen erfolgen auf Grundlage von EU-Standardvertragsklauseln
              (SCCs) gemäß Art. 46 Abs. 2 lit. c DSGVO sowie der Zertifizierung nach dem EU-US Data
              Privacy Framework. Trotz dieser Schutzmaßnahmen kann ein Restrisiko bestehen, dass
              US-Behörden auf die Daten zugreifen. Mit dieser Datenschutzerklärung informieren wir
              Sie ausdrücklich über dieses Restrisiko. Mit Ihrer Einwilligung zur Aufzeichnung
              willigen Sie zugleich in die beschriebene Drittlandübermittlung ein (Art. 49 Abs. 1
              lit. a DSGVO).
            </p>
            <H3>12.6 Speicherdauer</H3>
            <p>
              Anrufmetadaten (Telefonnummer, Datum, Dauer): 12 Monate. Audioaufzeichnungen und
              Transkripte: maximal 6 Monate ab Anrufdatum, danach automatische Löschung. Bei
              Kundenanfragen, die zu einem Vertragsabschluss führen, können relevante
              Gesprächsinhalte als schriftliche Notizen in die Schadenakte übernommen werden und
              unterliegen dann den Aufbewahrungsfristen gemäß Ziffer 6.
            </p>
            <H3>12.7 Hinweis zu § 201 StGB</H3>
            <p>
              Die Aufzeichnung von Telefongesprächen ohne Einwilligung der Gesprächspartner ist nach
              § 201 StGB (Verletzung der Vertraulichkeit des Wortes) strafbar. Aus diesem Grund holen
              wir Ihre Einwilligung zwingend vor jeder Aufzeichnung ein. Lehnen Sie ab, wird das
              Gespräch ohne Aufzeichnung geführt — ohne Nachteile für Sie.
            </p>
          </section>

          {/* 13. Ihre Rechte */}
          <section>
            <H2>13. Ihre Rechte als betroffene Person</H2>
            <p>
              Sie haben gegenüber uns folgende Rechte hinsichtlich der Sie betreffenden
              personenbezogenen Daten:
            </p>
            <ul className="mt-2 ml-1 space-y-1">
              <li>
                a) Auskunftsrecht (Art. 15 DSGVO): Sie können Auskunft darüber verlangen, ob und
                welche Daten wir über Sie verarbeiten;
              </li>
              <li>
                b) Recht auf Berichtigung (Art. 16 DSGVO): Sie können verlangen, dass unrichtige
                Daten berichtigt werden;
              </li>
              <li>
                c) Recht auf Löschung (Art. 17 DSGVO): Sie können verlangen, dass Ihre Daten gelöscht
                werden, sofern keine gesetzliche Aufbewahrungspflicht entgegensteht;
              </li>
              <li>
                d) Recht auf Einschränkung (Art. 18 DSGVO): Sie können die Einschränkung der
                Verarbeitung verlangen;
              </li>
              <li>
                e) Recht auf Datenübertragbarkeit (Art. 20 DSGVO): Sie können verlangen, dass wir
                Ihre Daten in einem strukturierten, gängigen und maschinenlesbaren Format
                übermitteln;
              </li>
              <li>
                f) Widerspruchsrecht (Art. 21 DSGVO): Sie können der Verarbeitung Ihrer Daten
                widersprechen, soweit diese auf Art. 6 Abs. 1 lit. e oder f DSGVO beruht;
              </li>
              <li>
                g) Recht auf Widerruf der Einwilligung (Art. 7 Abs. 3 DSGVO): Sie können eine
                erteilte Einwilligung jederzeit für die Zukunft widerrufen.
              </li>
            </ul>
            <p className="mt-3">
              Anfragen zur Ausübung Ihrer Rechte richten Sie bitte an{' '}
              <a href="mailto:datenschutz@claimondo.de" className={linkCls}>
                datenschutz@claimondo.de
              </a>
              . Wir antworten innerhalb eines Monats.
            </p>
            <H3>13.1 Beschwerderecht bei der Aufsichtsbehörde</H3>
            <p>
              Unbeschadet eines anderweitigen verwaltungsrechtlichen oder gerichtlichen
              Rechtsbehelfs steht Ihnen das Recht auf Beschwerde bei einer Aufsichtsbehörde zu,
              insbesondere in dem Mitgliedstaat Ihres Aufenthaltsorts, Ihres Arbeitsplatzes oder des
              Orts des mutmaßlichen Verstoßes (Art. 77 DSGVO). Die für uns zuständige
              Aufsichtsbehörde ist:
            </p>
            <p className="mt-2">
              Landesbeauftragte für Datenschutz und Informationsfreiheit Nordrhein-Westfalen (LDI
              NRW)
              <br />
              Postfach 20 04 44, 40102 Düsseldorf
              <br />
              Telefon: 0211/38424-0 · E-Mail:{' '}
              <a href="mailto:poststelle@ldi.nrw.de" className={linkCls}>
                poststelle@ldi.nrw.de
              </a>
            </p>
          </section>

          {/* 14. Automatisierte Entscheidungsfindung */}
          <section>
            <H2>14. Automatisierte Entscheidungsfindung und Profiling</H2>
            <p>
              Eine vollautomatisierte Entscheidungsfindung im Sinne des Art. 22 DSGVO findet nicht
              statt. Wir setzen zwar KI-gestützte Vorabkalkulationen ein (DAT-Expert), die finale
              Entscheidung über die Annahme eines Falls und die weitere Bearbeitung erfolgt jedoch
              stets durch einen Menschen.
            </p>
          </section>

          {/* 15. Datensicherheit */}
          <section>
            <H2>15. Datensicherheit</H2>
            <p>
              Wir treffen technische und organisatorische Maßnahmen, um Ihre Daten gegen zufällige
              oder vorsätzliche Manipulation, Verlust, Zerstörung oder gegen den Zugriff
              unberechtigter Personen zu schützen. Unsere Sicherheitsmaßnahmen werden entsprechend
              der technologischen Entwicklung fortlaufend verbessert.
            </p>
            <ul className="mt-2 ml-1 space-y-1">
              <li>a) Verschlüsselte Datenübertragung (TLS 1.3) auf allen Webseiten;</li>
              <li>b) Verschlüsselte Speicherung sensibler Daten (AES-256);</li>
              <li>c) Zugriffskontrollen und Berechtigungsmanagement;</li>
              <li>d) Regelmäßige Backups und Disaster-Recovery-Tests;</li>
              <li>e) Zugriffsprotokollierung;</li>
              <li>f) Schulung der Geschäftsführung im Datenschutz;</li>
              <li>g) Hosting auf einem dedizierten Server bei IONOS SE in Deutschland;</li>
              <li>h) Verschlüsselte Dokumentenspeicherung bei Supabase (Server-Standort EU/Frankfurt).</li>
            </ul>
          </section>

          {/* 16. Änderung */}
          <section>
            <H2>16. Änderung dieser Datenschutzerklärung</H2>
            <p>
              Wir behalten uns vor, diese Datenschutzerklärung anzupassen, um sie an geänderte
              Rechtslagen oder bei Änderungen unserer Dienste anzupassen. Für Ihren erneuten Besuch
              gilt dann die neue Datenschutzerklärung. Die jeweils aktuelle Version finden Sie auf
              claimondo.de/datenschutz, autounfall.io/datenschutz und autounfall.live/datenschutz.
            </p>
            <p className="mt-4 text-sm text-claimondo-shield/70">
              Stand dieser Datenschutzerklärung: April 2026 · Version 2.0
            </p>
            <p className="mt-1 text-sm text-claimondo-shield/70">
              Bei Fragen zum Datenschutz kontaktieren Sie uns bitte unter{' '}
              <a href="mailto:datenschutz@claimondo.de" className={linkCls}>
                datenschutz@claimondo.de
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
