// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, MailHeader, Card, Heading, Paragraph, InfoRow, Note, Footer } from '../../components'
import type { VsMeldungDaten } from '@/lib/vs-meldung/claim-daten'

// Slice 2c: Unfallmeldung an die HAFTPFLICHT DES UNFALLGEGNERS. Empfaenger ist ein
// Sachbearbeiter bei einem fremden Versicherer — kein Claimondo-Nutzer. Ton daher
// sachlich-geschaeftlich, kein Marketing, keine CTA-Buttons. Die Schadenfotos haengen
// als Anhang an der Mail (siehe vs-meldung/sende-unfallmeldung).

function formatDatum(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function subject(d: VsMeldungDaten): string {
  const teile = [
    'Schadenmeldung Haftpflichtschaden',
    d.gegner.kennzeichen ? `Kennzeichen ${d.gegner.kennzeichen}` : null,
    d.gegner.versicherungsnummer ? `Vers.-Nr. ${d.gegner.versicherungsnummer}` : null,
    d.claimNummer,
  ].filter(Boolean)
  return teile.join(' — ')
}

export function UnfallmeldungVsEmail(d: VsMeldungDaten & { absender: string }) {
  const unfallDatum = formatDatum(d.unfallDatum)

  return (
    <EmailShell preview={subject(d)}>
      <MailHeader />
      <Card>
        <Heading>Schadenmeldung — Haftpflichtschaden</Heading>

        <Paragraph>Sehr geehrte Damen und Herren,</Paragraph>
        <Paragraph>
          wir zeigen Ihnen einen Haftpflichtschaden an, an dem ein bei Ihnen versichertes Fahrzeug
          beteiligt ist. Der Unfallgegner hat die nachfolgenden Angaben selbst erfasst und
          bestätigt; seine Mobilfunknummer wurde per SMS verifiziert. Die Schadenfotos finden Sie
          im Anhang dieser E-Mail.
        </Paragraph>

        <Heading>Bei Ihnen versicherte Seite</Heading>
        {d.gegner.name ? <InfoRow label="Name" value={d.gegner.name} /> : null}
        {d.gegner.kennzeichen ? <InfoRow label="Kennzeichen" value={d.gegner.kennzeichen} /> : null}
        {d.gegner.versicherungsnummer ? (
          <InfoRow label="Vers.-Nr." value={d.gegner.versicherungsnummer} />
        ) : null}
        {d.gegner.versicherungsAktenzeichen ? (
          <InfoRow label="Aktenzeichen" value={d.gegner.versicherungsAktenzeichen} />
        ) : null}

        <Heading>Geschädigte Seite</Heading>
        {d.geschaedigt.firmaName ? <InfoRow label="Halter" value={d.geschaedigt.firmaName} /> : null}
        {d.geschaedigt.kennzeichen ? (
          <InfoRow label="Kennzeichen" value={d.geschaedigt.kennzeichen} />
        ) : null}
        {d.geschaedigt.fahrzeug ? <InfoRow label="Fahrzeug" value={d.geschaedigt.fahrzeug} /> : null}

        <Heading>Zum Unfall</Heading>
        {unfallDatum ? <InfoRow label="Unfalldatum" value={unfallDatum} /> : null}
        {d.claimNummer ? <InfoRow label="Vorgang" value={d.claimNummer} /> : null}
        {d.hergang ? <Paragraph>{d.hergang}</Paragraph> : null}

        <Paragraph>
          Wir machen die Ansprüche der geschädigten Seite nach § 249 BGB geltend. Ein
          Sachverständigengutachten wird beauftragt und Ihnen nach Fertigstellung übermittelt. Für
          Rückfragen stehen wir Ihnen gerne zur Verfügung.
        </Paragraph>

        <Paragraph>Mit freundlichen Grüßen</Paragraph>
        <Paragraph>{d.absender}</Paragraph>

        <Note>
          Diese Meldung wurde automatisch erzeugt, nachdem der Unfallgegner seine Angaben digital
          erfasst und per SMS bestätigt hat.
        </Note>
      </Card>
      <Footer />
    </EmailShell>
  )
}
